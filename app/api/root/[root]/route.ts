import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/infra/db";
import { wordMorphology } from "@/lib/infra/db/schema";
import { getVerses } from "@/lib/quran/quran-corpus";

/**
 * Concordance for an Arabic root: other verses that contain a word sharing it.
 * Reuses the same `word_morphology` table that grounds "By Root" connections
 * (see lib/connection-discovery.ts). Pure DB read — no AI. Returns an empty list
 * (200) on any failure so the word popover degrades gracefully.
 */
const MAX_VERSES = 24;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ root: string }> }) {
  const { root: rawRoot } = await params;
  const root = (rawRoot ?? "").trim();

  if (!root) {
    return NextResponse.json({ error: "Missing root" }, { status: 400 });
  }

  try {
    const rows = await db
      .select({ ref: wordMorphology.ref })
      .from(wordMorphology)
      .where(eq(wordMorphology.root, root))
      // GROUP BY instead of SELECT DISTINCT: Postgres requires DISTINCT's ORDER BY
      // expressions to appear in the select list, but a GROUP BY key has no such
      // restriction on functions of it. `ref` is "surah:ayah" text, so a plain
      // orderBy(ref) sorts lexicographically ("10:1" before "2:1") — split and
      // cast both halves to int for canonical (surah, ayah) order.
      .groupBy(wordMorphology.ref)
      .orderBy(
        sql`split_part(${wordMorphology.ref}, ':', 1)::int`,
        sql`split_part(${wordMorphology.ref}, ':', 2)::int`
      )
      .limit(MAX_VERSES);

    const refs = rows.map((r) => r.ref);
    const verseMap = await getVerses(refs);

    const verses = refs
      .map((ref) => {
        const v = verseMap.get(ref);
        if (!v) return null;
        return {
          ref: v.ref,
          surahName: v.surahName,
          surahNameArabic: v.surahNameArabic,
          snippet: v.translation.slice(0, 140),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    return NextResponse.json({ root, count: verses.length, verses });
  } catch (err) {
    console.error("Root concordance route error:", err);
    return NextResponse.json({ root, count: 0, verses: [] }, { status: 200 });
  }
}
