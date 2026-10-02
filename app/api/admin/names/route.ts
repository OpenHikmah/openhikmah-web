import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, ne } from "drizzle-orm";
import { requireAdmin, rateLimitAdminMutation } from "@/lib/admin/admin-auth";
import { logAdminAction } from "@/lib/admin/admin-audit";
import { db } from "@/lib/infra/db";
import { nameContent, nameVerseReasons } from "@/lib/infra/db/schema";
import { safeParse, parsePagination } from "@/lib/infra/http";
import { getVerses, isValidRef } from "@/lib/quran/quran-corpus";
import { containsTashbih } from "@/lib/ai/theological-constraints";
import { getNameBySlug } from "@/lib/names/divine-names";

const KINDS = ["verses", "reflection", "pairings"] as const;
type Kind = (typeof KINDS)[number];

// Admin edits are served to every user exactly like generated content, so they
// are held to the same bar as the generation paths (AGENTS.md theological
// standards): Quranic text only ever comes from the verified local corpus, the
// Tashbih backstop runs on every piece of prose, and a pairing must resolve to
// one of the canonical 99 names. Validators therefore *normalize*: they return
// the data to persist and never trust client-supplied Quran text or name fields.
type Normalized = { ok: true; data: unknown } | { ok: false; error: string };
const fail = (error: string): Normalized => ({ ok: false, error });

// Non-empty (not just typeof): PR #89's review on the pairings AI-generation
// route flagged that an empty `name` (unresolved slug reference) still got
// cached and served; admin edits must be held to the same bar.
function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim() !== "";
}

/** `reflection` is a single AI-generated paragraph (see app/api/names/[slug]/reflection/route.ts). */
async function normalizeReflection(data: unknown): Promise<Normalized> {
  if (!isNonEmptyString(data)) return fail("Reflection must be a non-empty string");
  if (containsTashbih(data)) return fail("Reflection contains Tashbih phrasing");
  return { ok: true, data };
}

/** `pairings` shape from app/api/names/[slug]/pairings/route.ts's Pairing type. */
async function normalizePairings(data: unknown): Promise<Normalized> {
  if (!Array.isArray(data)) return fail("Pairings must be an array");
  const pairings: Array<{
    name: string;
    transliteration: string;
    arabic: string;
    explanation: string;
  }> = [];
  for (const p of data) {
    if (typeof p !== "object" || p === null) return fail("Invalid pairing");
    const { name, explanation } = p as Record<string, unknown>;
    if (!isNonEmptyString(name) || !isNonEmptyString(explanation)) {
      return fail("Each pairing needs a name and an explanation");
    }
    const canonical = getNameBySlug(name);
    if (!canonical) return fail(`Pairing name "${name}" is not one of the 99 names`);
    if (containsTashbih(explanation)) {
      return fail(`Pairing explanation for "${name}" contains Tashbih phrasing`);
    }
    // Identity fields come from the canonical name so they can never disagree
    // with the slug the pairing links to.
    pairings.push({
      name: canonical.slug,
      transliteration: canonical.transliteration,
      arabic: canonical.arabic,
      explanation,
    });
  }
  return { ok: true, data: pairings };
}

/** `verses` shape from app/api/names/[slug]/verses/route.ts's NameVerse type. */
async function normalizeVerses(data: unknown): Promise<Normalized> {
  if (!Array.isArray(data)) return fail("Verses must be an array");
  const entries: Array<{ ref: string; reason: string }> = [];
  for (const v of data) {
    if (typeof v !== "object" || v === null) return fail("Invalid verse");
    const { ref, reason } = v as Record<string, unknown>;
    // Every AI-generation path validates refs against the local corpus before
    // use. This admin override path persists a ref straight to end users, so it
    // must be held to the same "never fabricate a Quran verse reference" bar.
    if (!isNonEmptyString(ref) || !isValidRef(ref)) return fail("Invalid verse reference");
    if (!isNonEmptyString(reason)) return fail(`Verse ${ref} needs a reason`);
    if (containsTashbih(reason)) return fail(`Reason for ${ref} contains Tashbih phrasing`);
    entries.push({ ref, reason });
  }
  // Quranic text is sacred data: the Arabic, translation and surah names are
  // always read from the verified corpus (en.sahih, the edition this cache is
  // built with); any text the client sent is ignored, so an edit can choose a
  // verse and a reason but can never alter the verse itself.
  const corpus = await getVerses(entries.map((e) => e.ref));
  const verses = [];
  for (const { ref, reason } of entries) {
    const verse = corpus.get(ref);
    if (!verse) return fail(`Verse ${ref} is not in the Quran corpus`);
    verses.push({
      ref: verse.ref,
      surah: verse.surah,
      ayah: verse.ayah,
      arabicText: verse.arabicText,
      translation: verse.translation,
      surahName: verse.surahName,
      surahNameArabic: verse.surahNameArabic,
      reason,
    });
  }
  return { ok: true, data: verses };
}

const NORMALIZERS: Record<Kind, (data: unknown) => Promise<Normalized>> = {
  reflection: normalizeReflection,
  pairings: normalizePairings,
  verses: normalizeVerses,
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

/** Overwrite the canonical English `data` for one (slug, kind). Body `{ slug, kind, data }`
 *  where `data` is validated and normalized (see NORMALIZERS) before it is stored.
 *  Only the `en` row is edited; the localized rows (and the per-locale verse
 *  reasons) were translated from the previous English, so they are deleted and
 *  regenerate from the edit rather than being overwritten with English text. */
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

  try {
    const normalized = await NORMALIZERS[kind as Kind](body.data);
    if (!normalized.ok) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }

    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(nameContent)
        .set({ data: JSON.stringify(normalized.data), updatedAt: new Date() })
        .where(
          and(
            eq(nameContent.slug, slug),
            eq(nameContent.kind, kind as Kind),
            eq(nameContent.locale, "en")
          )
        )
        .returning();
      if (!row) return null;

      await tx
        .delete(nameContent)
        .where(
          and(
            eq(nameContent.slug, slug),
            eq(nameContent.kind, kind as Kind),
            ne(nameContent.locale, "en")
          )
        );
      if (kind === "verses") {
        await tx
          .delete(nameVerseReasons)
          .where(and(eq(nameVerseReasons.slug, slug), ne(nameVerseReasons.locale, "en")));
      }
      return row;
    });

    if (!updated) {
      return NextResponse.json({ error: "No cached content for that name/kind" }, { status: 404 });
    }

    await logAdminAction({
      adminQfId: auth.user.qfId,
      action: "name.edit",
      targetType: "name_content",
      targetId: `${slug}/${kind}`,
    });

    return NextResponse.json({ slug, kind, data: normalized.data });
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
