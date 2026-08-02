import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/infra/db";
import { verses, verseTranslations, type VerseRow } from "@/lib/infra/db/schema";
import { getSurahName } from "@/lib/quran/surah-names";
import { SURAH_LENGTHS } from "@/lib/quran/audio";
import { correctTranslation } from "@/lib/quran/translation-corrections";
import type { Verse, VerseRef } from "@/types/quran";

/**
 * Local Quran corpus — reads verse data from the `verses` table instead of
 * fetching alquran.cloud / quran.com on every request. Seeded once by
 * `scripts/seed-quran.mjs`. Pure DB access: callers decide on any fallback.
 *
 * `edition` selects a row from `verse_translations`; `verses.translation`
 * (the en.sahih column, present on every row) is the fallback whenever the
 * requested edition has no row for that verse.
 */

function rowToVerse(
  row: VerseRow,
  opts?: { edition?: string; translationOverride?: string }
): Verse {
  const [surahName, surahNameArabic] = getSurahName(row.surah);
  const rawTranslation = opts?.translationOverride ?? row.translation;
  return {
    surah: row.surah,
    ayah: row.ayah,
    ref: row.ref as VerseRef,
    arabicText: row.arabicText,
    translation: correctTranslation(row.ref, opts?.edition, rawTranslation),
    surahName,
    surahNameArabic,
  };
}

/**
 * A syntactically valid verse reference within real Quran bounds: surah 1–114
 * and ayah within that surah's actual Hafs/Uthmani ayah count (so "1:8" is
 * rejected — Al-Fatihah has 7 ayahs — not just refs beyond a global ceiling).
 */
export function isValidRef(ref: string): boolean {
  const match = /^(\d+):(\d+)$/.exec(ref);
  if (!match) return false;
  const surah = parseInt(match[1], 10);
  const ayah = parseInt(match[2], 10);
  return surah >= 1 && surah <= 114 && ayah >= 1 && ayah <= SURAH_LENGTHS[surah - 1];
}

/**
 * Returns the verse for a `"surah:ayah"` ref, or null if not in the corpus.
 * `edition` (e.g. "tr.diyanet") selects a translation; omit for en.sahih.
 */
export async function getVerse(ref: string, edition?: string): Promise<Verse | null> {
  if (!edition) {
    const rows = await db.select().from(verses).where(eq(verses.ref, ref)).limit(1);
    return rows[0] ? rowToVerse(rows[0]) : null;
  }
  const rows = await db
    .select({ verse: verses, translationText: verseTranslations.text })
    .from(verses)
    .leftJoin(
      verseTranslations,
      and(eq(verseTranslations.ref, verses.ref), eq(verseTranslations.edition, edition))
    )
    .where(eq(verses.ref, ref))
    .limit(1);
  const row = rows[0];
  return row
    ? rowToVerse(row.verse, { edition, translationOverride: row.translationText ?? undefined })
    : null;
}

/** Batch lookup. Returns a map keyed by ref; missing refs are simply absent. */
export async function getVerses(refs: string[], edition?: string): Promise<Map<string, Verse>> {
  if (refs.length === 0) return new Map();
  if (!edition) {
    const rows = await db.select().from(verses).where(inArray(verses.ref, refs));
    return new Map(rows.map((r) => [r.ref, rowToVerse(r)]));
  }
  const rows = await db
    .select({ verse: verses, translationText: verseTranslations.text })
    .from(verses)
    .leftJoin(
      verseTranslations,
      and(eq(verseTranslations.ref, verses.ref), eq(verseTranslations.edition, edition))
    )
    .where(inArray(verses.ref, refs));
  return new Map(
    rows.map((r) => [
      r.verse.ref,
      rowToVerse(r.verse, { edition, translationOverride: r.translationText ?? undefined }),
    ])
  );
}

/** Subset of `refs` that exist in the corpus — used to reject hallucinated refs. */
export async function existingRefs(refs: string[]): Promise<Set<string>> {
  if (refs.length === 0) return new Set();
  const rows = await db.select({ ref: verses.ref }).from(verses).where(inArray(verses.ref, refs));
  return new Set(rows.map((r) => r.ref));
}
