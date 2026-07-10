import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type { Verse } from "@/types/quran";

const { mockSearchByMeaning, mockConsume, mockGetVerse, mockGetVerses } = vi.hoisted(() => ({
  mockSearchByMeaning: vi.fn(),
  mockConsume: vi.fn(async () => true),
  mockGetVerse: vi.fn(),
  mockGetVerses: vi.fn(async () => new Map()),
}));
vi.mock("@/lib/quran/semantic-search", () => ({ searchByMeaning: mockSearchByMeaning }));
vi.mock("@/lib/infra/rate-limit", () => ({ consume: mockConsume }));
vi.mock("@/lib/quran/quran-corpus", () => ({
  getVerse: mockGetVerse,
  getVerses: mockGetVerses,
}));
vi.mock("@/lib/infra/search-log", () => ({ logSearchQuery: vi.fn(async () => undefined) }));

import { GET } from "@/app/api/search/route";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function makeSearchReq(q: string, extra = "") {
  return new NextRequest(`http://localhost/api/search?q=${encodeURIComponent(q)}${extra}`);
}

function makeMeaningReq(q: string, headers: Record<string, string> = {}, extra = "") {
  return new NextRequest(
    `http://localhost/api/search?q=${encodeURIComponent(q)}&mode=meaning${extra}`,
    { headers }
  );
}

function verse(ref: string, translation: string): Verse {
  const [s, a] = ref.split(":");
  return {
    surah: Number(s),
    ayah: Number(a),
    ref: ref as Verse["ref"],
    arabicText: "ar",
    translation,
    surahName: "Surah",
    surahNameArabic: "سورة",
  };
}

function semanticMatch(ref: string, translation: string) {
  return { verse: verse(ref, translation), similarity: 0.9 };
}

function quranComResponse(results: unknown[], total?: number) {
  return {
    ok: true,
    json: async () => ({ search: { results, total_results: total ?? results.length } }),
  };
}

describe("GET /api/search", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockSearchByMeaning.mockReset();
    mockConsume.mockReset();
    mockConsume.mockResolvedValue(true);
    mockGetVerse.mockReset();
    mockGetVerses.mockReset();
    mockGetVerses.mockResolvedValue(new Map());
  });

  it("returns 400 when query is missing", async () => {
    const req = new NextRequest("http://localhost/api/search");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns single SearchResult for ref-format query", async () => {
    mockGetVerse.mockResolvedValueOnce(verse("2:255", "Allah - there is no deity except Him..."));
    const req = makeSearchReq("2:255");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toHaveLength(1);
    expect(body.total).toBe(1);
    expect(body.results[0].ref).toBe("2:255");
    expect(mockFetch).not.toHaveBeenCalled(); // no external call for ref lookup
  });

  it("includes correct surahNameArabic for ref-format query", async () => {
    mockGetVerse.mockResolvedValueOnce(null);
    const req = makeSearchReq("1:1");
    const res = await GET(req);
    const body = await res.json();
    expect(body.results[0].surahNameArabic).toBe("الفاتحة");
  });

  it("calls quran.com for text query and returns results", async () => {
    mockFetch.mockResolvedValueOnce(
      quranComResponse([
        {
          verse_key: "2:30",
          translations: [{ text: "And recall when your Lord said to the angels..." }],
        },
        {
          verse_key: "6:165",
          translations: [{ text: "It is He who made you successors on earth..." }],
        },
      ])
    );

    const req = makeSearchReq("mercy");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toHaveLength(2);
    expect(body.results[0].ref).toBe("2:30");
    expect(body.results[1].ref).toBe("6:165");
    expect(body.total).toBe(2);
  });

  it("forwards page/pageSize to quran.com and returns them in the response", async () => {
    mockFetch.mockResolvedValueOnce(quranComResponse([], 42));
    const res = await GET(makeSearchReq("salam", "&page=2&pageSize=20"));
    const body = await res.json();
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining("size=20"), expect.anything());
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining("page=2"), expect.anything());
    expect(body.page).toBe(2);
    expect(body.pageSize).toBe(20);
    expect(body.total).toBe(42);
  });

  it("strips HTML tags from snippets", async () => {
    mockFetch.mockResolvedValueOnce(
      quranComResponse([
        {
          verse_key: "3:1",
          translations: [{ text: "<em>Alif</em> <strong>Lam</strong> Mim." }],
        },
      ])
    );

    const req = makeSearchReq("alif");
    const res = await GET(req);
    const body = await res.json();
    expect(body.results[0].snippet).not.toContain("<em>");
    expect(body.results[0].snippet).not.toContain("<strong>");
    expect(body.results[0].snippet).toContain("Alif");
  });

  it("filters out results without valid verse_key", async () => {
    mockFetch.mockResolvedValueOnce(
      quranComResponse([
        { verse_key: "2:1", translations: [{ text: "Valid" }] },
        { verse_key: "invalid", translations: [{ text: "Bad" }] },
        { translations: [{ text: "No key" }] },
      ])
    );

    const req = makeSearchReq("test");
    const res = await GET(req);
    const body = await res.json();
    expect(body.results).toHaveLength(1);
    expect(body.results[0].ref).toBe("2:1");
  });

  it("returns empty results when quran.com returns non-ok", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    const req = makeSearchReq("test");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toEqual([]);
    expect(body.total).toBe(0);
  });

  it("returns empty results when fetch throws", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network error"));
    const req = makeSearchReq("test");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toEqual([]);
    expect(body.total).toBe(0);
  });

  it("mode=meaning uses semantic search and maps matches to SearchResults", async () => {
    mockSearchByMeaning.mockResolvedValueOnce([
      semanticMatch("94:5", "For indeed, with hardship will be ease."),
      semanticMatch("2:286", "Allah does not burden a soul beyond that it can bear."),
    ]);

    const res = await GET(makeMeaningReq("staying strong through hardship"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results.map((r: { ref: string }) => r.ref)).toEqual(["94:5", "2:286"]);
    expect(body.results[0].snippet).toContain("hardship");
    expect(mockFetch).not.toHaveBeenCalled(); // no quran.com call in meaning mode
  });

  it("mode=meaning paginates the capped ranked list in memory", async () => {
    const matches = Array.from({ length: 30 }, (_, i) =>
      semanticMatch(`1:${i + 1}`, `verse ${i + 1}`)
    );
    mockSearchByMeaning.mockResolvedValueOnce(matches);

    const res = await GET(makeMeaningReq("mercy", {}, "&page=2&pageSize=10"));
    const body = await res.json();
    expect(body.results).toHaveLength(10);
    expect(body.results[0].ref).toBe("1:11");
    expect(body.total).toBe(30);
    expect(body.page).toBe(2);
  });

  it("mode=meaning still answers ref-format queries directly", async () => {
    mockGetVerse.mockResolvedValueOnce(null);
    const res = await GET(makeMeaningReq("2:255"));
    const body = await res.json();
    expect(body.results).toHaveLength(1);
    expect(body.results[0].ref).toBe("2:255");
    expect(mockSearchByMeaning).not.toHaveBeenCalled();
  });

  it("mode=meaning falls back to keyword search when semantic search throws", async () => {
    mockSearchByMeaning.mockRejectedValueOnce(new Error("no embeddings"));
    mockFetch.mockResolvedValueOnce(
      quranComResponse([{ verse_key: "1:3", translations: [{ text: "the Lord of Mercy" }] }])
    );
    const res = await GET(makeMeaningReq("mercy"));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-search-fallback")).toBe("keyword");
    const body = await res.json();
    expect(body.results.map((r: { ref: string }) => r.ref)).toEqual(["1:3"]);
  });

  it("mode=meaning falls back to keyword when semantic search is empty (not seeded)", async () => {
    mockSearchByMeaning.mockResolvedValueOnce([]);
    mockFetch.mockResolvedValueOnce(
      quranComResponse([{ verse_key: "1:1", translations: [{ text: "In the name of God" }] }])
    );
    const res = await GET(makeMeaningReq("mercy"));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-search-fallback")).toBe("keyword");
    expect((await res.json()).results[0].ref).toBe("1:1");
  });

  it("mode=meaning rate-limits under the last (proxy-appended) hop of x-forwarded-for", async () => {
    mockSearchByMeaning.mockResolvedValueOnce([]);
    await GET(makeMeaningReq("mercy", { "x-forwarded-for": "203.0.113.7, 70.41.3.18" }));
    expect(mockConsume).toHaveBeenCalledWith("search:70.41.3.18");
  });

  it("mode=meaning buckets a malformed x-forwarded-for under 'unknown'", async () => {
    mockSearchByMeaning.mockResolvedValueOnce([]);
    await GET(makeMeaningReq("mercy", { "x-forwarded-for": "x".repeat(500) }));
    expect(mockConsume).toHaveBeenCalledWith("search:unknown");
  });

  it("mode=meaning falls back to keyword (not 429) when rate-limited, without embedding", async () => {
    mockConsume.mockResolvedValue(false);
    mockFetch.mockResolvedValueOnce(
      quranComResponse([{ verse_key: "2:1", translations: [{ text: "Alif Lam Mim" }] }])
    );
    const res = await GET(makeMeaningReq("mercy"));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-search-fallback")).toBe("keyword");
    expect(mockSearchByMeaning).not.toHaveBeenCalled();
    expect((await res.json()).results[0].ref).toBe("2:1");
  });

  it("does not rate-limit the keyword path", async () => {
    mockFetch.mockResolvedValueOnce(quranComResponse([]));
    await GET(makeSearchReq("mercy"));
    expect(mockConsume).not.toHaveBeenCalled();
  });
});
