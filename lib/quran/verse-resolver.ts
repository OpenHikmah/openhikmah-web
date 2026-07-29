import { getVerse } from "@/lib/quran/quran-corpus";
import { getSurahName } from "@/lib/quran/surah-names";
import { isValidEdition } from "@/lib/i18n/config";
import type { Verse, VerseRef } from "@/types/quran";

const DEFAULT_EDITION = "en.sahih";

/**
 * Resolves a verse ref to full verse data: local corpus first, falling back to a
 * live alquran.cloud fetch while the corpus is being populated. Returns null for
 * references that resolve nowhere — which doubles as validation against
 * hallucinated references. `edition` selects a translation (whitelisted against
 * lib/i18n/config's VALID_EDITIONS — an unrecognized value falls back to en.sahih
 * rather than being interpolated into the live-fetch URL).
 */
export async function resolveVerse(ref: string, edition?: string): Promise<Verse | null> {
  const safeEdition = edition && isValidEdition(edition) ? edition : DEFAULT_EDITION;
  try {
    const local = await getVerse(ref, safeEdition === DEFAULT_EDITION ? undefined : safeEdition);
    if (local) return local;
  } catch (err) {
    // `ref` is passed as a data argument, never interpolated into the first
    // (format) argument — avoids an externally-controlled format string.
    console.error("Corpus lookup failed for %s, falling back to live fetch:", ref, err);
  }
  return fetchVerseLive(ref, safeEdition);
}

async function fetchVerseLive(ref: string, edition: string): Promise<Verse | null> {
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
      fetch(`https://api.alquran.cloud/v1/ayah/${surahNum}:${ayahNum}/${edition}`, {
        next: { revalidate: 86400 },
      }),
    ]);
    if (!arabicRes.ok) return null;

    // The requested edition can 404 upstream even though the ayah exists (a
    // gap in that translator's coverage) — fall back to en.sahih rather than
    // failing the whole verse lookup.
    let translationData: { data: { text: string } };
    if (translationRes.ok) {
      translationData = await translationRes.json();
    } else if (edition !== DEFAULT_EDITION) {
      const fallbackRes = await fetch(
        `https://api.alquran.cloud/v1/ayah/${surahNum}:${ayahNum}/${DEFAULT_EDITION}`,
        { next: { revalidate: 86400 } }
      );
      if (!fallbackRes.ok) return null;
      translationData = await fallbackRes.json();
    } else {
      return null;
    }

    const arabicData = await arabicRes.json();
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
