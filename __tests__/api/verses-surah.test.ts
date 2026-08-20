import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type { Verse } from "@/types/quran";

const { mockGetVerses, mockGetQuranEdition } = vi.hoisted(() => ({
  mockGetVerses: vi.fn(),
  mockGetQuranEdition: vi.fn(),
}));
vi.mock("@/lib/quran/quran-corpus", () => ({ getVerses: mockGetVerses }));
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
    mockGetVerses.mockReset();
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

  it("requests every ref of the surah in order and returns them in order", async () => {
    const map = new Map([
      ["1:1", verse("1:1")],
      ["1:2", verse("1:2")],
      ["1:3", verse("1:3")],
      ["1:4", verse("1:4")],
      ["1:5", verse("1:5")],
      ["1:6", verse("1:6")],
      ["1:7", verse("1:7")],
    ]);
    mockGetVerses.mockResolvedValueOnce(map);

    const res = await GET(new NextRequest("http://localhost/api/verses/1"), params("1"));
    expect(res.status).toBe(200);
    expect(mockGetVerses).toHaveBeenCalledWith(
      ["1:1", "1:2", "1:3", "1:4", "1:5", "1:6", "1:7"],
      "en.sahih"
    );
    const body = await res.json();
    expect(body).toHaveLength(7);
    expect(body.map((v: Verse) => v.ref)).toEqual([
      "1:1",
      "1:2",
      "1:3",
      "1:4",
      "1:5",
      "1:6",
      "1:7",
    ]);
  });

  it("omits refs missing from the corpus rather than erroring", async () => {
    const map = new Map([
      ["1:1", verse("1:1")],
      ["1:3", verse("1:3")],
    ]);
    mockGetVerses.mockResolvedValueOnce(map);

    const res = await GET(new NextRequest("http://localhost/api/verses/1"), params("1"));
    const body = await res.json();
    expect(body.map((v: Verse) => v.ref)).toEqual(["1:1", "1:3"]);
  });

  it("resolves against the caller's cookie-selected edition", async () => {
    mockGetQuranEdition.mockResolvedValue("tr.diyanet");
    mockGetVerses.mockResolvedValueOnce(new Map());
    await GET(new NextRequest("http://localhost/api/verses/1"), params("1"));
    expect(mockGetVerses).toHaveBeenCalledWith(expect.any(Array), "tr.diyanet");
  });
});
