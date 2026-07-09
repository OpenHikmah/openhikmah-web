import { describe, it, expect } from "vitest";
import { SURAH_NAMES, getSurahName } from "@/lib/quran/surah-names";

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
