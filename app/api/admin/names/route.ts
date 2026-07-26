import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { requireAdmin, rateLimitAdminMutation } from "@/lib/admin/admin-auth";
import { logAdminAction } from "@/lib/admin/admin-audit";
import { db } from "@/lib/infra/db";
import { nameContent } from "@/lib/infra/db/schema";
import { safeParse } from "@/lib/infra/http";

const KINDS = ["verses", "reflection", "pairings"] as const;
type Kind = (typeof KINDS)[number];

function isStringField(v: unknown): v is string {
  return typeof v === "string";
}

/** `reflection` is a single AI-generated paragraph (see app/api/names/[slug]/reflection/route.ts). */
function isValidReflection(data: unknown): boolean {
  return typeof data === "string";
}

/** `pairings` shape from app/api/names/[slug]/pairings/route.ts's Pairing type. */
function isValidPairings(data: unknown): boolean {
  if (!Array.isArray(data)) return false;
  return data.every((p) => {
    if (typeof p !== "object" || p === null) return false;
    const { name, transliteration, arabic, explanation } = p as Record<string, unknown>;
    return (
      isStringField(name) &&
      isStringField(transliteration) &&
      isStringField(arabic) &&
      isStringField(explanation)
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
    return (
      isStringField(ref) &&
      typeof surah === "number" &&
      typeof ayah === "number" &&
      isStringField(arabicText) &&
      isStringField(translation) &&
      isStringField(surahName) &&
      isStringField(surahNameArabic) &&
      isStringField(reason)
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

  try {
    const rows = await db
      .select()
      .from(nameContent)
      .orderBy(asc(nameContent.slug), asc(nameContent.kind));

    return NextResponse.json({
      rows: rows.map((r) => ({
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
