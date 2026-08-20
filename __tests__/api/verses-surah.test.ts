import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type { Verse } from "@/types/quran";

const { mockGetSurahVerses, mockGetQuranEdition } = vi.hoisted(() => ({
  mockGetSurahVerses: vi.fn(),
  mockGetQuranEdition: vi.fn(),
}));
vi.mock("@/lib/quran/quran-corpus", () => ({ getSurahVerses: mockGetSurahVerses }));
vi.mock("@/lib/i18n/request-prefs", () => ({ getQuranEdition: mockGetQuranEdition }));

import { GET } from "@/app/api/verses/[surah]/route";

function params(surah: string) {
  return { params: Promise.resolve({ surah }) };
}

function verse(ref: string): Verse {
  const [s, a] = ref.split(":");
  return {
    surah: Number(s),
    ayah: Number(a),
    ref: ref as Verse["ref"],
    arabicText: "نَص",
    translation: "text",
    surahName: "Al-Fatiha",
    surahNameArabic: "الفاتحة",
  };
}

describe("GET /api/verses/[surah]", () => {
  beforeEach(() => {
    mockGetSurahVerses.mockReset();
    mockGetSurahVerses.mockResolvedValue([]);
    mockGetQuranEdition.mockReset();
    mockGetQuranEdition.mockResolvedValue("en.sahih");
  });

  it("returns 400 for surah 0", async () => {
    const res = await GET(new NextRequest("http://localhost/api/verses/0"), params("0"));
    expect(res.status).toBe(400);
  });

  it("returns 400 for surah 115", async () => {
    const res = await GET(new NextRequest("http://localhost/api/verses/115"), params("115"));
    expect(res.status).toBe(400);
  });

  it("returns 400 for a non-numeric surah", async () => {
    const res = await GET(new NextRequest("http://localhost/api/verses/abc"), params("abc"));
    expect(res.status).toBe(400);
  });

  it("returns 400 for a surah segment with trailing non-digit characters", async () => {
    const res = await GET(new NextRequest("http://localhost/api/verses/18abc"), params("18abc"));
    expect(res.status).toBe(400);
    expect(mockGetSurahVerses).not.toHaveBeenCalled();
  });

  it("returns the verses from getSurahVerses, in the order given, for a valid surah", async () => {
    const list = ["1:1", "1:2", "1:3"].map(verse);
    mockGetSurahVerses.mockResolvedValueOnce(list);

    const res = await GET(new NextRequest("http://localhost/api/verses/1"), params("1"));
    expect(res.status).toBe(200);
    expect(mockGetSurahVerses).toHaveBeenCalledWith(1, "en.sahih");
    const body = await res.json();
    expect(body.map((v: Verse) => v.ref)).toEqual(["1:1", "1:2", "1:3"]);
  });

  it("resolves against the caller's cookie-selected edition", async () => {
    mockGetQuranEdition.mockResolvedValue("tr.diyanet");
    await GET(new NextRequest("http://localhost/api/verses/1"), params("1"));
    expect(mockGetSurahVerses).toHaveBeenCalledWith(1, "tr.diyanet");
  });
});
