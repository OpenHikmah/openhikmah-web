import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { requireAdmin, rateLimitAdminMutation } from "@/lib/admin/admin-auth";
import { logAdminAction } from "@/lib/admin/admin-audit";
import { db } from "@/lib/infra/db";
import { nameContent } from "@/lib/infra/db/schema";
import { safeParse, parsePagination } from "@/lib/infra/http";
import { isValidRef } from "@/lib/quran/quran-corpus";

const KINDS = ["verses", "reflection", "pairings"] as const;
type Kind = (typeof KINDS)[number];

// Non-empty (not just typeof) — PR #89's review on the pairings AI-generation
// route flagged that an empty `name` (unresolved slug reference) still got
// cached and served; admin edits must be held to the same bar.
function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim() !== "";
}

/** `reflection` is a single AI-generated paragraph (see app/api/names/[slug]/reflection/route.ts). */
function isValidReflection(data: unknown): boolean {
  return isNonEmptyString(data);
}

/** `pairings` shape from app/api/names/[slug]/pairings/route.ts's Pairing type. */
function isValidPairings(data: unknown): boolean {
  if (!Array.isArray(data)) return false;
  return data.every((p) => {
    if (typeof p !== "object" || p === null) return false;
    const { name, transliteration, arabic, explanation } = p as Record<string, unknown>;
    return (
      isNonEmptyString(name) &&
      isNonEmptyString(transliteration) &&
      isNonEmptyString(arabic) &&
      isNonEmptyString(explanation)
    );
  });
}

/** `verses` shape from app/api/names/[slug]/verses/route.ts's NameVerse type. */
function isValidVerses(data: unknown): boolean {
  if (!Array.isArray(data)) return false;
  return data.every((v) => {
    if (typeof v !== "object" || v === null) return false;
    const { ref, surah, ayah, arabicText, translation, surahName, surahNameArabic, reason } =
      v as Record<string, unknown>;
    if (!isNonEmptyString(ref) || !isValidRef(ref)) return false;
    // ref is the identity downstream features (e.g. InteractiveArabic) key
    // morphology lookups on; surah/ayah must agree with it or a mismatched
    // payload can present one verse's text under another verse's reference.
    const [refSurah, refAyah] = ref.split(":").map(Number);
    return (
      // Every AI-generation path validates refs against the local corpus
      // before use (lib/ai/connection-generator.ts, fallbackAIVerses in
      // names/[slug]/verses/route.ts) — this admin override path is the one
      // place that persists a ref straight to end users, so it must be held
      // to the same "never fabricate a Quran verse reference" bar, not just
      // checked for non-empty-string shape.
      surah === refSurah &&
      ayah === refAyah &&
      isNonEmptyString(arabicText) &&
      isNonEmptyString(translation) &&
      isNonEmptyString(surahName) &&
      isNonEmptyString(surahNameArabic) &&
      isNonEmptyString(reason)
    );
  });
}

const VALIDATORS: Record<Kind, (data: unknown) => boolean> = {
  reflection: isValidReflection,
  pairings: isValidPairings,
  verses: isValidVerses,
};

/** All cached 99-Names AI content rows (slug + kind), for review/override. */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { limit, offset } = parsePagination(req);

  try {
    const rows = await db
      .select()
      .from(nameContent)
      .orderBy(asc(nameContent.slug), asc(nameContent.kind))
      .limit(limit + 1)
      .offset(offset);

    const hasMore = rows.length > limit;
    return NextResponse.json({
      hasMore,
      rows: rows.slice(0, limit).map((r) => ({
        slug: r.slug,
        kind: r.kind,
        data: safeParse(r.data),
        model: r.model,
        version: r.version,
        updatedAt: r.updatedAt,
      })),
    });
  } catch (err) {
    console.error("admin names GET db error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** Overwrite the cached `data` for one (slug, kind). Body `{ slug, kind, data }`
 *  where `data` is the JSON payload (validated as serialisable). */
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const limited = await rateLimitAdminMutation(auth);
  if (limited) return limited;

  let body: { slug?: string; kind?: string; data?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { slug, kind } = body;
  if (!slug || !kind || !(KINDS as readonly string[]).includes(kind)) {
    return NextResponse.json({ error: "Invalid slug or kind" }, { status: 400 });
  }
  if (body.data === undefined) {
    return NextResponse.json({ error: "Missing data" }, { status: 400 });
  }
  if (!VALIDATORS[kind as Kind](body.data)) {
    return NextResponse.json({ error: `Invalid data shape for kind "${kind}"` }, { status: 400 });
  }

  try {
    const [updated] = await db
      .update(nameContent)
      .set({ data: JSON.stringify(body.data), updatedAt: new Date() })
      .where(and(eq(nameContent.slug, slug), eq(nameContent.kind, kind as (typeof KINDS)[number])))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "No cached content for that name/kind" }, { status: 404 });
    }

    await logAdminAction({
      adminQfId: auth.user.qfId,
      action: "name.edit",
      targetType: "name_content",
      targetId: `${slug}/${kind}`,
    });

    return NextResponse.json({ slug, kind, data: body.data });
  } catch (err) {
    console.error("admin names PATCH db error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** Invalidate a cached entry: `?slug=&kind=`. Next read regenerates it fresh. */
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const limited = await rateLimitAdminMutation(auth);
  if (limited) return limited;

  const slug = req.nextUrl.searchParams.get("slug");
  const kind = req.nextUrl.searchParams.get("kind");
  if (!slug || !kind || !(KINDS as readonly string[]).includes(kind)) {
    return NextResponse.json({ error: "Invalid slug or kind" }, { status: 400 });
  }

  try {
    await db
      .delete(nameContent)
      .where(and(eq(nameContent.slug, slug), eq(nameContent.kind, kind as (typeof KINDS)[number])));

    await logAdminAction({
      adminQfId: auth.user.qfId,
      action: "name.invalidate",
      targetType: "name_content",
      targetId: `${slug}/${kind}`,
    });

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("admin names DELETE db error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
