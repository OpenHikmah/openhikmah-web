import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Verse, VerseRef } from "@/types/quran";

const { mockGetVerse, mockGetSurahName } = vi.hoisted(() => ({
  mockGetVerse: vi.fn(),
  mockGetSurahName: vi.fn(),
}));

vi.mock("@/lib/quran/quran-corpus", () => ({ getVerse: mockGetVerse }));
vi.mock("@/lib/quran/surah-names", () => ({ getSurahName: mockGetSurahName }));

import { resolveVerse } from "@/lib/quran/verse-resolver";

function verse(ref: string): Verse {
  const [s, a] = ref.split(":");
  return {
    surah: parseInt(s, 10),
    ayah: parseInt(a, 10),
    ref: ref as VerseRef,
    arabicText: "نص",
    translation: "text",
    surahName: "Surah",
    surahNameArabic: "سورة",
  };
}

describe("resolveVerse", () => {
  beforeEach(() => {
    mockGetVerse.mockReset();
    mockGetSurahName.mockReset();
    mockGetSurahName.mockReturnValue(["Al-Fatihah", "الفاتحة"]);
    vi.stubGlobal("fetch", vi.fn());
  });

  it("returns the local corpus verse without hitting the live API", async () => {
    const v = verse("1:1");
    mockGetVerse.mockResolvedValue(v);
    const result = await resolveVerse("1:1");
    expect(result).toBe(v);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("falls back to the live API when the corpus has no entry", async () => {
    mockGetVerse.mockResolvedValue(null);
    vi.mocked(fetch).mockImplementation(async (url: string | URL | Request) => {
      const isArabic = String(url).includes("ar.alafasy");
      return {
        ok: true,
        json: async () => ({ data: { text: isArabic ? "نص عربي" : "English text" } }),
      } as Response;
    });
    const result = await resolveVerse("2:255");
    expect(result).toMatchObject({
      surah: 2,
      ayah: 255,
      ref: "2:255",
      arabicText: "نص عربي",
      translation: "English text",
    });
  });

  it("falls back to the live API when the corpus lookup throws", async () => {
    mockGetVerse.mockRejectedValue(new Error("db down"));
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ data: { text: "x" } }),
    } as Response);
    const result = await resolveVerse("1:1");
    expect(result).not.toBeNull();
  });

  it("returns null for a malformed ref without calling the live API", async () => {
    mockGetVerse.mockResolvedValue(null);
    const result = await resolveVerse("not-a-ref");
    expect(result).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns null for a surah number out of bounds", async () => {
    mockGetVerse.mockResolvedValue(null);
    const result = await resolveVerse("115:1");
    expect(result).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns null when either live fetch response is not ok", async () => {
    mockGetVerse.mockResolvedValue(null);
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    const result = await resolveVerse("2:255");
    expect(result).toBeNull();
  });

  it("returns null and does not throw when the live fetch rejects", async () => {
    mockGetVerse.mockResolvedValue(null);
    vi.mocked(fetch).mockRejectedValue(new Error("network error"));
    const result = await resolveVerse("2:255");
    expect(result).toBeNull();
  });
});
