import { describe, it, expect } from "vitest";
import {
  SURAH_NAMES,
  getSurahName,
  matchSurahsByQuery,
  isExactSurahNameMatch,
} from "@/lib/quran/surah-names";

describe("SURAH_NAMES", () => {
  it("contains exactly 114 entries", () => {
    expect(Object.keys(SURAH_NAMES)).toHaveLength(114);
  });

  it("starts with Al-Fatiha", () => {
    expect(SURAH_NAMES[1]).toEqual(["Al-Fatiha", "الفاتحة"]);
  });

  it("ends with An-Nas", () => {
    expect(SURAH_NAMES[114]).toEqual(["An-Nas", "الناس"]);
  });

  it("includes well-known surahs at correct positions", () => {
    expect(SURAH_NAMES[2][0]).toBe("Al-Baqarah");
    expect(SURAH_NAMES[36][0]).toBe("Ya-Sin");
    expect(SURAH_NAMES[112][0]).toBe("Al-Ikhlas");
    expect(SURAH_NAMES[55][0]).toBe("Ar-Rahman");
  });

  it("every entry has two non-empty strings", () => {
    for (const [key, val] of Object.entries(SURAH_NAMES)) {
      expect(typeof val[0]).toBe("string");
      expect(typeof val[1]).toBe("string");
      expect(val[0].length).toBeGreaterThan(0);
      expect(val[1].length).toBeGreaterThan(0);
      expect(Number(key)).toBeGreaterThanOrEqual(1);
      expect(Number(key)).toBeLessThanOrEqual(114);
    }
  });
});

describe("getSurahName", () => {
  it("returns correct name for surah 1", () => {
    expect(getSurahName(1)).toEqual(["Al-Fatiha", "الفاتحة"]);
  });

  it("returns correct name for surah 114", () => {
    expect(getSurahName(114)).toEqual(["An-Nas", "الناس"]);
  });

  it("returns fallback for surah 0", () => {
    expect(getSurahName(0)).toEqual(["Surah 0", "سورة 0"]);
  });

  it("returns fallback for surah 115", () => {
    expect(getSurahName(115)).toEqual(["Surah 115", "سورة 115"]);
  });

  it("returns fallback for negative number", () => {
    expect(getSurahName(-1)).toEqual(["Surah -1", "سورة -1"]);
  });
});

describe("matchSurahsByQuery", () => {
  it("matches a bare transliteration without the Al- prefix", () => {
    expect(matchSurahsByQuery("kahf")).toEqual([18]);
  });

  it("matches the full hyphenated name", () => {
    expect(matchSurahsByQuery("Al-Kahf")).toEqual([18]);
  });

  it("is case-insensitive", () => {
    expect(matchSurahsByQuery("KAHF")).toEqual([18]);
  });

  it("matches a surah name with no Al-/An- prefix", () => {
    expect(matchSurahsByQuery("Maryam")).toEqual([19]);
  });

  it("matches a space-separated prefix", () => {
    expect(matchSurahsByQuery("Al Kahf")).toEqual([18]);
  });

  it("matches a bare name with the Ar- prefix stripped", () => {
    expect(matchSurahsByQuery("rad")).toEqual([13]);
  });

  it("matches surah 1", () => {
    expect(matchSurahsByQuery("fatiha")).toEqual([1]);
  });

  it("returns no matches for a non-surah topic search", () => {
    expect(matchSurahsByQuery("mercy")).toEqual([]);
  });

  it("returns no matches for a verse-ref-shaped query", () => {
    expect(matchSurahsByQuery("2:255")).toEqual([]);
  });

  it("returns no matches for an empty query", () => {
    expect(matchSurahsByQuery("")).toEqual([]);
  });

  it("returns no matches for a query under the minimum length", () => {
    expect(matchSurahsByQuery("b")).toEqual([]);
  });

  it("lists every surah whose name starts with a short partial query, in ascending order", () => {
    // Al-Baqarah (2), Al-Balad (90), Al-Bayyinah (98) — all start with "ba"
    // once their Al-/An- style prefix is stripped.
    expect(matchSurahsByQuery("ba")).toEqual([2, 90, 98]);
  });

  it("matches an Arabic-script query against the Arabic name", () => {
    expect(matchSurahsByQuery("الكهف")).toEqual([18]);
  });

  it("matches a localized name passed via the localizedNames map", () => {
    const localized = new Map([[18, "Kehf"]]); // Turkish transliteration
    expect(matchSurahsByQuery("Kehf", localized)).toEqual([18]);
  });

  it("matches a Cyrillic localized name (regression: must not strip non-Latin letters)", () => {
    const localized = new Map([[18, "Пещера"]]); // Russian, "the cave"
    expect(matchSurahsByQuery("Пещера", localized)).toEqual([18]);
    expect(matchSurahsByQuery("пещ", localized)).toEqual([18]);
  });

  it("matches against the localizedNames entry's own surah number, not a hardcoded one", () => {
    const localized = new Map([[5, "Kehf"]]); // deliberately not surah 18
    expect(matchSurahsByQuery("Kehf", localized)).toEqual([5]);
  });
});

describe("isExactSurahNameMatch", () => {
  it("is true for a bare transliteration equal to the full name", () => {
    expect(isExactSurahNameMatch("kahf", [18])).toBe(true);
  });

  it("is true for the full hyphenated name", () => {
    expect(isExactSurahNameMatch("Al-Fatiha", [1])).toBe(true);
  });

  it("is true for an exact Arabic name match", () => {
    expect(isExactSurahNameMatch("الكهف", [18])).toBe(true);
  });

  it("is true for an exact localized name match", () => {
    const localized = new Map([[18, "Пещера"]]);
    expect(isExactSurahNameMatch("Пещера", [18], localized)).toBe(true);
  });

  it("is false for a short prefix that only partially matches several names", () => {
    // "ba" only starts Al-Baqarah/Al-Balad/Al-Bayyinah, it isn't equal to any of them.
    expect(isExactSurahNameMatch("ba", [2, 90, 98])).toBe(false);
  });

  it("is false for a prefix match of a single surah", () => {
    expect(isExactSurahNameMatch("sa", [34, 37, 38, 61])).toBe(false);
  });

  it("is false when matchedNumbers is empty", () => {
    expect(isExactSurahNameMatch("kahf", [])).toBe(false);
  });
});
