import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockSimilarVerses } = vi.hoisted(() => ({ mockSimilarVerses: vi.fn() }));
vi.mock("@/lib/semantic-search", () => ({ similarVerses: mockSimilarVerses }));

import { GET } from "@/app/api/verse/[surah]/[ayah]/similar/route";

function call(surah: string, ayah: string) {
  return GET(new NextRequest("http://localhost/api/verse/x/similar"), {
    params: Promise.resolve({ surah, ayah }),
  });
}

function match(ref: string) {
  const [s, a] = ref.split(":");
  return {
    verse: {
      surah: Number(s),
      ayah: Number(a),
      ref,
      arabicText: "ar",
      translation: `tr-${ref}`,
      surahName: "Surah",
      surahNameArabic: "سورة",
    },
    similarity: 0.8,
  };
}

describe("GET /api/verse/[surah]/[ayah]/similar", () => {
  beforeEach(() => mockSimilarVerses.mockReset());

  it("returns similar verses for a valid ref", async () => {
    mockSimilarVerses.mockResolvedValueOnce([match("2:255"), match("3:18")]);
    const res = await call("1", "1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.map((m: { verse: { ref: string } }) => m.verse.ref)).toEqual(["2:255", "3:18"]);
    expect(mockSimilarVerses).toHaveBeenCalledWith("1:1", 5);
  });

  it("returns 400 for an out-of-bounds reference", async () => {
    const res = await call("999", "1");
    expect(res.status).toBe(400);
    expect(mockSimilarVerses).not.toHaveBeenCalled();
  });

  it("returns [] (200) when the service throws", async () => {
    mockSimilarVerses.mockRejectedValueOnce(new Error("no embeddings"));
    const res = await call("1", "1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });
});
