import { describe, it, expect } from "vitest";
import { normalizeArabic, tokenizeVerse, type MorphologyWord } from "@/lib/arabic-morphology";

// Real morphology for Surah 1:1 (from data/morphology/001.jsonl).
const BISMILLAH_WORDS: MorphologyWord[] = [
  { position: 1, surface: "بِسْمِ", root: "سمو", lemma: "اسْم" },
  { position: 2, surface: "ٱللَّهِ", root: "اله", lemma: "اللَّه" },
  { position: 3, surface: "ٱلرَّحْمَـٰنِ", root: "رحم", lemma: "رَّحْمَٰن" },
  { position: 4, surface: "ٱلرَّحِيمِ", root: "رحم", lemma: "رَّحِيم" },
];

describe("normalizeArabic", () => {
  it("strips tashkeel so diacritic-different forms compare equal", () => {
    expect(normalizeArabic("بِسْمِ")).toBe(normalizeArabic("بسم"));
    expect(normalizeArabic("ٱلرَّحِيمِ")).toBe(normalizeArabic("الرحيم"));
  });

  it("unifies alef variants (wasla → bare alef)", () => {
    // wasla alef vs plain alef should normalize identically.
    expect(normalizeArabic("ٱللَّهِ")).toBe(normalizeArabic("اللَّهِ"));
  });

  it("tolerates tatweel + superscript-alef differences between editions", () => {
    // surface form (tatweel) vs verse form (no tatweel) of ar-Rahman.
    expect(normalizeArabic("ٱلرَّحْمَـٰنِ")).toBe(normalizeArabic("ٱلرَّحْمَٰنِ"));
  });

  it("returns empty string for whitespace/marks only", () => {
    expect(normalizeArabic("  ")).toBe("");
  });
});

describe("tokenizeVerse", () => {
  it("attaches root + lemma to every matching word", () => {
    // Verse-edition spelling differs slightly from the morphology surfaces.
    const verse = "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ";
    const tokens = tokenizeVerse(verse, BISMILLAH_WORDS);

    expect(tokens).toHaveLength(4);
    expect(tokens.map((t) => t.root)).toEqual(["سمو", "اله", "رحم", "رحم"]);
    expect(tokens[0].lemma).toBe("اسْم");
    // Original spelling is preserved for rendering.
    expect(tokens[0].text).toBe("بِسْمِ");
  });

  it("leaves unmatched tokens plain (no cascading misalignment)", () => {
    const verse = "قُلْ بِسْمِ ٱللَّهِ";
    const tokens = tokenizeVerse(verse, BISMILLAH_WORDS);

    expect(tokens).toHaveLength(3);
    expect(tokens[0].root).toBeUndefined(); // "قُلْ" not in this verse's morphology
    expect(tokens[1].root).toBe("سمو");
    expect(tokens[2].root).toBe("اله");
  });

  it("ignores morphology words without a root", () => {
    const words: MorphologyWord[] = [{ position: 1, surface: "وَ", root: null, lemma: null }];
    const tokens = tokenizeVerse("وَ بِسْمِ", words);
    expect(tokens[0].root).toBeUndefined();
    expect(tokens[1].root).toBeUndefined();
  });

  it("renders every token plain when no morphology is seeded", () => {
    const verse = "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ";
    const tokens = tokenizeVerse(verse, []);
    expect(tokens).toHaveLength(4);
    expect(tokens.every((t) => t.root === undefined)).toBe(true);
    expect(tokens.map((t) => t.text).join(" ")).toBe(verse);
  });
});
