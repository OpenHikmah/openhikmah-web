import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/search/route";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function makeSearchReq(q: string) {
  return new NextRequest(`http://localhost/api/search?q=${encodeURIComponent(q)}`);
}

function quranComResponse(results: unknown[]) {
  return {
    ok: true,
    json: async () => ({ search: { results } }),
  };
}

describe("GET /api/search", () => {
  beforeEach(() => mockFetch.mockReset());

  it("returns 400 when query is missing", async () => {
    const req = new NextRequest("http://localhost/api/search");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns single SearchResult for ref-format query", async () => {
    const req = makeSearchReq("2:255");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(1);
    expect(body[0].ref).toBe("2:255");
    expect(body[0].surahName).toBe("Al-Baqarah");
    expect(mockFetch).not.toHaveBeenCalled(); // no external call for ref lookup
  });

  it("includes correct surahNameArabic for ref-format query", async () => {
    const req = makeSearchReq("1:1");
    const res = await GET(req);
    const [result] = await res.json();
    expect(result.surahNameArabic).toBe("الفاتحة");
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
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
    expect(body[0].ref).toBe("2:30");
    expect(body[1].ref).toBe("6:165");
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
    const [result] = await res.json();
    expect(result.snippet).not.toContain("<em>");
    expect(result.snippet).not.toContain("<strong>");
    expect(result.snippet).toContain("Alif");
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
    expect(body).toHaveLength(1);
    expect(body[0].ref).toBe("2:1");
  });

  it("returns empty array when quran.com returns non-ok", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    const req = makeSearchReq("test");
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("returns empty array when fetch throws", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network error"));
    const req = makeSearchReq("test");
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });
});
