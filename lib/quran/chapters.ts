// Localized surah/chapter names for non-English UI locales, sourced from
// quran.com's public chapters API — the same external host `keywordSearch`
// (app/api/search/route.ts) already proxies for full-text search. Used only
// to widen surah-name search matching; never hand-written, since inventing
// 114 translated names from memory risks getting them wrong.

interface ChapterApiResponse {
  chapters?: Array<{
    id?: number;
    translated_name?: { name?: string };
  }>;
}

/** Returns surah number -> localized chapter name, or an empty map if the
 *  locale is English (no fetch needed — callers fall back to SURAH_NAMES) or
 *  the request fails for any reason. Search must never break because this
 *  external call is slow/unavailable. */
export async function fetchLocalizedChapterNames(language: string): Promise<Map<number, string>> {
  if (language === "en") return new Map();

  try {
    const res = await fetch(`https://api.quran.com/api/v4/chapters?language=${language}`, {
      headers: { Accept: "application/json" },
      // Chapter names never change — cache generously, same fetch-cache
      // mechanism keywordSearch uses with a much shorter revalidate window.
      next: { revalidate: 86400 },
    });
    if (!res.ok) return new Map();

    const data = (await res.json()) as ChapterApiResponse;
    const names = new Map<number, string>();
    for (const chapter of data.chapters ?? []) {
      if (typeof chapter.id === "number" && typeof chapter.translated_name?.name === "string") {
        names.set(chapter.id, chapter.translated_name.name);
      }
    }
    return names;
  } catch (err) {
    console.error("fetchLocalizedChapterNames error:", err);
    return new Map();
  }
}
