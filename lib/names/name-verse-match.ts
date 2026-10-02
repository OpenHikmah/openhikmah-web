import { eq } from "drizzle-orm";
import { db } from "@/lib/infra/db";
import { wordMorphology } from "@/lib/infra/db/schema";
import { normalizeArabic } from "@/lib/quran/arabic-morphology";
import { incr } from "@/lib/infra/metrics";
import { DIVINE_NAMES } from "@/lib/names/divine-names";
import type { DivineName } from "@/lib/names/divine-names/types";

/**
 * Deterministic (zero AI cost) check that a verse really contains a divine
 * name. Used on the AI-fallback verse selection of the names route, where the
 * model proposes refs from memory and only their validity as references was
 * checked: the reason shown for such a verse asserts that it relates to the
 * name, which this makes true.
 *
 * It is deliberately conservative. A false rejection is safe (the verse is
 * dropped and an empty selection is retried, never cached); a false acceptance
 * is not, so only forms that are plainly the name pass.
 */

// Letters that vary by orthography/edition: ى→ي, ة→ه, hamza seats folded to
// their carrier, bare hamza dropped. The Uthmani corpus writes a long ā as a
// dagger alef (ٱلسَّلَٰمُ) where the names data spells a full alef (السلام), so the
// dagger alef becomes an alef before normalizeArabic strips the marks. An
// explicit medial alef is otherwise kept: مالك and ملك are different words.
function fold(input: string): string {
  return normalizeArabic(input.replace(/ٰ/g, "ا"))
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ء/g, "");
}

// A single fused proclitic on a name without the article (و "and", ف, ب, ك, ل).
const PROCLITICS = /^[وفبكل]/;
// Up to two fused proclitics before the definite article (وبال, فال, ...); a lam
// proclitic assimilates the article's alef (لل).
const ARTICLE_WITH_PROCLITICS = /^[وفبك]{0,2}(?:ال|لل)(.+)$/;
// A stem shorter than this is too common a word to match on its own
// (e.g. الله with the article stripped is له).
const MIN_STEM_LENGTH = 3;

/** Every spelling of `word` that should count as the same name. */
function forms(word: string): Set<string> {
  const base = fold(word);
  const out = new Set<string>([base, base.replace(PROCLITICS, "")]);
  const fused = ARTICLE_WITH_PROCLITICS.exec(base);
  if (fused) {
    out.add(`ال${fused[1]}`);
    if (fused[1].length >= MIN_STEM_LENGTH) out.add(fused[1]);
  }
  return out;
}

/** Roots that more than one divine name carries (ر-ح-م: ar-rahman and ar-rahim). */
const SHARED_ROOTS: ReadonlySet<string> = (() => {
  const counts = new Map<string, number>();
  for (const n of DIVINE_NAMES) {
    const root = n.root.replace(/-/g, "");
    counts.set(root, (counts.get(root) ?? 0) + 1);
  }
  return new Set([...counts].filter(([, n]) => n > 1).map(([root]) => root));
})();

/** A word of the verse as `word_morphology` records it. */
export interface MorphologyWord {
  root: string | null;
  lemma: string | null;
}

/** Root letters without the hyphens ("ر-ح-م" → "رحم"), folded like verse text. */
export function rootLetters(root: string): string {
  return fold(root.replace(/-/g, ""));
}

/**
 * Pure text check: does any word of `arabicText` equal the name, ignoring
 * tashkeel and the definite article/proclitics? Plurals do not count: the
 * plural of a name (e.g. the believers) is not the Name.
 *
 * `morphology`, when given, are the verse's words from `word_morphology`, and
 * can also accept the verse, but never on a root that another divine name
 * shares (ar-rahman and ar-rahim both come from ر-ح-م, so that root says only
 * that one of them is present). For a shared root the word's lemma must be the
 * requested name itself; an unshared root is specific enough on its own.
 */
export function verseContainsName(
  arabicText: string,
  name: Pick<DivineName, "arabic" | "root">,
  morphology?: MorphologyWord[]
): boolean {
  const wanted = forms(name.arabic);
  const isName = (word: string) => [...forms(word)].some((f) => wanted.has(f));
  if (arabicText.split(/\s+/).some((token) => token !== "" && isName(token))) return true;

  if (morphology) {
    const root = rootLetters(name.root);
    const rootIsSpecific = !SHARED_ROOTS.has(name.root.replace(/-/g, ""));
    for (const w of morphology) {
      if (w.lemma && isName(w.lemma)) return true;
      if (rootIsSpecific && w.root && rootLetters(w.root) === root) return true;
    }
  }
  return false;
}

/**
 * {@link verseContainsName} with `word_morphology` as an authoritative upgrade
 * when it has rows for the ref. The table is only partly seeded, so no rows
 * means "unknown" (text check alone), never a rejection; a lookup failure is
 * logged and metered and falls back to the text check the same way.
 */
export async function verseMentionsName(
  ref: string,
  arabicText: string,
  name: Pick<DivineName, "arabic" | "root">
): Promise<boolean> {
  if (verseContainsName(arabicText, name)) return true;
  try {
    const rows = await db
      .select({ root: wordMorphology.root, lemma: wordMorphology.lemma })
      .from(wordMorphology)
      .where(eq(wordMorphology.ref, ref));
    return verseContainsName(arabicText, name, rows);
  } catch (err) {
    console.error(`Name verse match: morphology lookup failed for ${ref}:`, err);
    incr("names_morphology_lookup_error");
    return false;
  }
}
