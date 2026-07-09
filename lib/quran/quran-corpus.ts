import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/infra/db";
import { verses, type VerseRow } from "@/lib/infra/db/schema";
import { getSurahName } from "@/lib/quran/surah-names";
import type { Verse, VerseRef } from "@/types/quran";

/**
 * Local Quran corpus — reads verse data from the `verses` table instead of
 * fetching alquran.cloud / quran.com on every request. Seeded once by
 * `scripts/seed-quran.mjs`. Pure DB access: callers decide on any fallback.
 */

function rowToVerse(row: VerseRow): Verse {
  const [surahName, surahNameArabic] = getSurahName(row.surah);
  return {
    surah: row.surah,
    ayah: row.ayah,
    ref: row.ref as VerseRef,
    arabicText: row.arabicText,
    translation: row.translation,
    surahName,
    surahNameArabic,
  };
}

// The longest surah (2, Al-Baqarah) has 286 ayahs — no surah exceeds this, so
// it's a safe generous upper bound without needing a full per-surah table.
// isValidRef intentionally doesn't validate the exact per-surah count; refs
// that pass this but don't exist (e.g. "114:200") simply fail to resolve
// downstream (getVerse/getVerses return null/absent), same as any other
// not-found ref.
const MAX_AYAH = 286;

/** A syntactically valid verse reference within Quran bounds (surah 1–114). */
export function isValidRef(ref: string): boolean {
  const match = /^(\d+):(\d+)$/.exec(ref);
  if (!match) return false;
  const surah = parseInt(match[1], 10);
  const ayah = parseInt(match[2], 10);
  return surah >= 1 && surah <= 114 && ayah >= 1 && ayah <= MAX_AYAH;
}

/** Returns the verse for a `"surah:ayah"` ref, or null if not in the corpus. */
export async function getVerse(ref: string): Promise<Verse | null> {
  const rows = await db.select().from(verses).where(eq(verses.ref, ref)).limit(1);
  return rows[0] ? rowToVerse(rows[0]) : null;
}

/** Batch lookup. Returns a map keyed by ref; missing refs are simply absent. */
export async function getVerses(refs: string[]): Promise<Map<string, Verse>> {
  if (refs.length === 0) return new Map();
  const rows = await db.select().from(verses).where(inArray(verses.ref, refs));
  return new Map(rows.map((r) => [r.ref, rowToVerse(r)]));
}

/** Subset of `refs` that exist in the corpus — used to reject hallucinated refs. */
export async function existingRefs(refs: string[]): Promise<Set<string>> {
  if (refs.length === 0) return new Set();
  const rows = await db.select({ ref: verses.ref }).from(verses).where(inArray(verses.ref, refs));
  return new Set(rows.map((r) => r.ref));
}
