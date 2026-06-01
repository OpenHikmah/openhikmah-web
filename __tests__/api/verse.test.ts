import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockGetVerse } = vi.hoisted(() => ({ mockGetVerse: vi.fn() }));
vi.mock("@/lib/quran-corpus", () => ({ getVerse: mockGetVerse }));

import { GET } from "@/app/api/verse/[surah]/[ayah]/route";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function arabicResponse(text = "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ") {
  return { ok: true, json: async () => ({ data: { text } }) };
}

function translationResponse(text = "In the name of Allah, the Most Gracious, the Most Merciful.") {
  return { ok: true, json: async () => ({ data: { text } }) };
}

function params(surah: string, ayah: string) {
  return { params: Promise.resolve({ surah, ayah }) };
}

describe("GET /api/verse/[surah]/[ayah]", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    // Default: corpus miss → exercises the live-fetch fallback path.
    mockGetVerse.mockReset();
    mockGetVerse.mockResolvedValue(null);
  });

  it("serves from the local corpus without fetching when present", async () => {
    mockGetVerse.mockResolvedValue({
      surah: 2,
      ayah: 255,
      ref: "2:255",
      arabicText: "اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ",
      translation: "Allah - there is no deity except Him.",
      surahName: "Al-Baqarah",
      surahNameArabic: "البقرة",
    });

    const req = new NextRequest("http://localhost/api/verse/2/255");
    const res = await GET(req, params("2", "255"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ref).toBe("2:255");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns 400 when surah is 0", async () => {
    const req = new NextRequest("http://localhost/api/verse/0/1");
    const res = await GET(req, params("0", "1"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("returns 400 when surah is 115", async () => {
    const req = new NextRequest("http://localhost/api/verse/115/1");
    const res = await GET(req, params("115", "1"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when surah is NaN", async () => {
    const req = new NextRequest("http://localhost/api/verse/abc/1");
    const res = await GET(req, params("abc", "1"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when ayah is 0", async () => {
    const req = new NextRequest("http://localhost/api/verse/1/0");
    const res = await GET(req, params("1", "0"));
    expect(res.status).toBe(400);
  });

  it("returns 404 when external API returns non-ok", async () => {
    mockFetch.mockResolvedValue({ ok: false });
    const req = new NextRequest("http://localhost/api/verse/1/1");
    const res = await GET(req, params("1", "1"));
    expect(res.status).toBe(404);
  });

  it("returns 200 with verse data on success", async () => {
    mockFetch
      .mockResolvedValueOnce(arabicResponse("بِسْمِ اللَّهِ"))
      .mockResolvedValueOnce(translationResponse("In the name of Allah"));

    const req = new NextRequest("http://localhost/api/verse/1/1");
    const res = await GET(req, params("1", "1"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.ref).toBe("1:1");
    expect(body.surah).toBe(1);
    expect(body.ayah).toBe(1);
    expect(body.arabicText).toBe("بِسْمِ اللَّهِ");
    expect(body.translation).toBe("In the name of Allah");
    expect(body.surahName).toBe("Al-Fatiha");
    expect(body.surahNameArabic).toBe("الفاتحة");
  });

  it("returns 200 with correct surah name for surah 2", async () => {
    mockFetch
      .mockResolvedValueOnce(arabicResponse("الم"))
      .mockResolvedValueOnce(translationResponse("Alif Lam Mim."));

    const req = new NextRequest("http://localhost/api/verse/2/1");
    const res = await GET(req, params("2", "1"));
    const body = await res.json();
    expect(body.surahName).toBe("Al-Baqarah");
  });

  it("returns 404 when the verse resolves nowhere (fetch throws)", async () => {
    mockFetch.mockRejectedValue(new Error("network error"));
    const req = new NextRequest("http://localhost/api/verse/1/1");
    const res = await GET(req, params("1", "1"));
    expect(res.status).toBe(404);
  });
});
