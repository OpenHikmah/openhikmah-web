import { getVerse } from "@/lib/quran-corpus";
import { getSurahName } from "@/lib/surah-names";
import type { Verse, VerseRef } from "@/types/quran";

/**
 * Resolves a verse ref to full verse data: local corpus first, falling back to a
 * live alquran.cloud fetch while the corpus is being populated. Returns null for
 * references that resolve nowhere — which doubles as validation against
 * hallucinated references.
 */
export async function resolveVerse(ref: string): Promise<Verse | null> {
  try {
    const local = await getVerse(ref);
    if (local) return local;
  } catch (err) {
    // `ref` is passed as a data argument, never interpolated into the first
    // (format) argument — avoids an externally-controlled format string.
    console.error("Corpus lookup failed for %s, falling back to live fetch:", ref, err);
  }
  return fetchVerseLive(ref);
}

async function fetchVerseLive(ref: string): Promise<Verse | null> {
  const match = /^(\d+):(\d+)$/.exec(ref);
  if (!match) return null;
  const surahNum = parseInt(match[1], 10);
  const ayahNum = parseInt(match[2], 10);
  if (surahNum < 1 || surahNum > 114 || ayahNum < 1) return null;

  try {
    const [arabicRes, translationRes] = await Promise.all([
      fetch(`https://api.alquran.cloud/v1/ayah/${surahNum}:${ayahNum}/ar.alafasy`, {
        next: { revalidate: 86400 },
      }),
      fetch(`https://api.alquran.cloud/v1/ayah/${surahNum}:${ayahNum}/en.sahih`, {
        next: { revalidate: 86400 },
      }),
    ]);
    if (!arabicRes.ok || !translationRes.ok) return null;

    const [arabicData, translationData] = await Promise.all([
      arabicRes.json(),
      translationRes.json(),
    ]);
    const [surahName, surahNameArabic] = getSurahName(surahNum);

    return {
      surah: surahNum,
      ayah: ayahNum,
      ref: ref as VerseRef,
      arabicText: arabicData.data.text,
      translation: translationData.data.text,
      surahName,
      surahNameArabic,
    };
  } catch (err) {
    // Log so an upstream outage is distinguishable from a genuinely missing
    // verse (both surface as null → 404 at the API layer).
    console.error("Live verse fetch failed for %s:", ref, err);
    return null;
  }
}
