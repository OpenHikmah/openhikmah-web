import { eq } from "drizzle-orm";
import { db } from "@/lib/infra/db";
import { wordMorphology } from "@/lib/infra/db/schema";
import { normalizeArabic } from "@/lib/quran/arabic-morphology";
import { incr } from "@/lib/infra/metrics";
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
// their carrier, bare hamza dropped. Applied on top of normalizeArabic (which
// strips tashkeel/Quranic marks and unifies alef variants).
function fold(input: string): string {
  return normalizeArabic(input)
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

// The Uthmani corpus writes long ā as a dagger alef (stripped above) where the
// names data spells a full alef (ٱلسَّلَٰمُ vs السلام), so compare with every
// alef after the first letter ignored (the first is the article's).
function ignoreMedialAlef(word: string): string {
  return word.length > 1 ? word[0] + word.slice(1).replace(/ا/g, "") : word;
}

/** Every spelling of `word` that should count as the same name. */
function forms(word: string): Set<string> {
  const base = fold(word);
  const out = new Set<string>([base, base.replace(PROCLITICS, "")]);
  const fused = ARTICLE_WITH_PROCLITICS.exec(base);
  if (fused) {
    out.add(`ال${fused[1]}`);
    if (fused[1].length >= MIN_STEM_LENGTH) out.add(fused[1]);
  }
  return new Set([...out].map(ignoreMedialAlef));
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
 * `corpusRoots`, when given, are the roots of the verse's words from
 * `word_morphology`; a word with the name's root then also passes. The name's
 * own spelling is checked first because several names share a root (ar-rahman
 * and ar-rahim), and the stem match is the more specific evidence.
 */
export function verseContainsName(
  arabicText: string,
  name: Pick<DivineName, "arabic" | "root">,
  corpusRoots?: string[]
): boolean {
  const wanted = forms(name.arabic);
  const tokens = arabicText.split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    for (const form of forms(token)) {
      if (wanted.has(form)) return true;
    }
  }
  if (corpusRoots && corpusRoots.length > 0) {
    const root = rootLetters(name.root);
    return corpusRoots.some((r) => rootLetters(r) === root);
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
      .select({ root: wordMorphology.root })
      .from(wordMorphology)
      .where(eq(wordMorphology.ref, ref));
    const roots = rows.flatMap((r) => (r.root ? [r.root] : []));
    return verseContainsName(arabicText, name, roots);
  } catch (err) {
    console.error(`Name verse match: morphology lookup failed for ${ref}:`, err);
    incr("names_morphology_lookup_error");
    return false;
  }
}
