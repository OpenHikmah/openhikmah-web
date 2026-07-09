/**
 * Pure helpers for word-level Quran interactivity.
 *
 * The `word_morphology` table stores only root-bearing words, each with its
 * original `position` and `surface` form (full diacritics). To make the words in
 * a rendered verse interactive we match each whitespace token of the verse against
 * those surfaces. Verse text and morphology can come from slightly different
 * editions, so matching is done on a *normalized* form (diacritics/tatweel
 * stripped, alef variants unified). Matching per-token is self-correcting — a word
 * that doesn't match simply stays plain, with no cascading misalignment.
 */

export interface MorphologyWord {
  position: number;
  surface: string;
  root: string | null;
  lemma: string | null;
}

export interface VerseToken {
  /** The original token text, rendered as-is (diacritics preserved). */
  text: string;
  /** Present only when the token matched a root-bearing morphology entry. */
  root?: string;
  lemma?: string;
}

// Arabic combining marks (tashkeel, Quranic annotation signs, superscript alef)
// plus tatweel (U+0640) — all dropped for matching.
const DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۜ۟-۪ۨ-ۭـ]/g;
// Alef variants: madda (U+0622), hamza-above (U+0623), hamza-below (U+0625),
// wasla (U+0671) → bare alef (U+0627).
const ALEF_VARIANTS = /[آأإٱ]/g;

/** Strip diacritics/tatweel and unify alef variants for edition-tolerant matching. */
export function normalizeArabic(input: string): string {
  return input.replace(DIACRITICS, "").replace(ALEF_VARIANTS, "ا").trim();
}

/**
 * Split a verse into render tokens, attaching root/lemma to any token whose
 * normalized form matches a root-bearing morphology surface. Order and original
 * spelling are preserved; unmatched tokens carry no root.
 */
export function tokenizeVerse(arabicText: string, words: MorphologyWord[]): VerseToken[] {
  const bySurface = new Map<string, { root: string; lemma: string | null }>();
  for (const w of words) {
    if (!w.root) continue;
    const key = normalizeArabic(w.surface);
    if (key && !bySurface.has(key)) bySurface.set(key, { root: w.root, lemma: w.lemma });
  }

  const tokens = arabicText.trim().split(/\s+/).filter(Boolean);
  return tokens.map((text) => {
    const match = bySurface.get(normalizeArabic(text));
    if (!match) return { text };
    return { text, root: match.root, lemma: match.lemma ?? undefined };
  });
}
