import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type { Verse } from "@/types/quran";

const {
  mockSearchByMeaning,
  mockConsume,
  mockGetVerse,
  mockGetVerses,
  mockLogSearchQuery,
  mockGetQuranEdition,
  mockGetUiLocale,
  mockFetchLocalizedChapterNames,
} = vi.hoisted(() => ({
  mockSearchByMeaning: vi.fn(),
  mockConsume: vi.fn(async (_key: string, _limit?: number, _windowSeconds?: number) => true),
  mockGetVerse: vi.fn(),
  mockGetVerses: vi.fn(async () => new Map()),
  mockLogSearchQuery: vi.fn(async () => undefined),
  mockGetQuranEdition: vi.fn(async () => "en.sahih"),
  mockGetUiLocale: vi.fn(async () => "en"),
  mockFetchLocalizedChapterNames: vi.fn(async () => new Map<number, string>()),
}));
vi.mock("@/lib/quran/semantic-search", () => ({ searchByMeaning: mockSearchByMeaning }));
vi.mock("@/lib/infra/rate-limit", () => ({
  consume: mockConsume,
  SEARCH_LOG_LIMIT: 30,
  SEARCH_LOG_WINDOW_SECONDS: 60,
  KEYWORD_SEARCH_LIMIT: 60,
  KEYWORD_SEARCH_WINDOW_SECONDS: 60,
}));
vi.mock("@/lib/quran/quran-corpus", () => ({
  getVerse: mockGetVerse,
  getVerses: mockGetVerses,
}));
vi.mock("@/lib/infra/search-log", () => ({ logSearchQuery: mockLogSearchQuery }));
vi.mock("@/lib/i18n/request-prefs", () => ({
  getQuranEdition: mockGetQuranEdition,
  getUiLocale: mockGetUiLocale,
}));
vi.mock("@/lib/quran/chapters", () => ({
  fetchLocalizedChapterNames: mockFetchLocalizedChapterNames,
}));

import { GET } from "@/app/api/search/route";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function makeSearchReq(q: string, extra = "", headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost/api/search?q=${encodeURIComponent(q)}${extra}`, {
    headers,
  });
}

const ARABIC_BY_REF: Record<string, string> = {
  "2:255": "اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ",
  "94:5": "فَإِنَّ مَعَ الْعُسْرِ يُسْرًا",
  "2:286": "لَا يُكَلِّفُ اللَّهُ نَفْسًا إِلَّا وُسْعَهَا",
};

function verse(ref: string, translation: string): Verse {
  const [s, a] = ref.split(":");
  return {
    surah: Number(s),
    ayah: Number(a),
    ref: ref as Verse["ref"],
    arabicText: ARABIC_BY_REF[ref] ?? ARABIC_BY_REF["2:255"],
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
    mockSearchByMeaning.mockResolvedValue([]);
    mockConsume.mockReset();
    mockConsume.mockResolvedValue(true);
    mockGetVerse.mockReset();
    mockGetVerses.mockReset();
    mockGetVerses.mockResolvedValue(new Map());
    mockLogSearchQuery.mockReset();
    mockLogSearchQuery.mockResolvedValue(undefined);
    mockGetQuranEdition.mockReset();
    mockGetQuranEdition.mockResolvedValue("en.sahih");
    mockGetUiLocale.mockReset();
    mockGetUiLocale.mockResolvedValue("en");
    mockFetchLocalizedChapterNames.mockReset();
    mockFetchLocalizedChapterNames.mockResolvedValue(new Map());
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

  it("does not crash when the local DB lookup throws for a ref-format query", async () => {
    mockGetVerse.mockRejectedValueOnce(new Error("connection refused"));
    const req = makeSearchReq("2:255");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results[0].ref).toBe("2:255");
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

  it("includes deduplicated semantic matches as `related` alongside keyword results", async () => {
    mockFetch.mockResolvedValueOnce(
      quranComResponse([{ verse_key: "1:3", translations: [{ text: "the Lord of Mercy" }] }])
    );
    mockSearchByMeaning.mockResolvedValueOnce([
      semanticMatch("1:3", "the Lord of Mercy"), // duplicate of a keyword result — must be dropped
      semanticMatch("94:5", "For indeed, with hardship will be ease."),
      semanticMatch("2:286", "Allah does not burden a soul beyond that it can bear."),
    ]);

    const res = await GET(makeSearchReq("mercy"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results.map((r: { ref: string }) => r.ref)).toEqual(["1:3"]);
    expect(body.related.map((r: { ref: string }) => r.ref)).toEqual(["94:5", "2:286"]);
  });

  it("caps `related` at RELATED_RESULT_CAP (5)", async () => {
    mockFetch.mockResolvedValueOnce(quranComResponse([]));
    mockSearchByMeaning.mockResolvedValueOnce(
      Array.from({ length: 15 }, (_, i) => semanticMatch(`1:${i + 1}`, `verse ${i + 1}`))
    );

    const res = await GET(makeSearchReq("mercy"));
    const body = await res.json();
    expect(body.related).toHaveLength(5);
  });

  it("omits `related` entirely when semantic search finds nothing", async () => {
    mockFetch.mockResolvedValueOnce(
      quranComResponse([{ verse_key: "1:1", translations: [{ text: "In the name of God" }] }])
    );
    mockSearchByMeaning.mockResolvedValueOnce([]);

    const res = await GET(makeSearchReq("mercy"));
    const body = await res.json();
    expect(body.related).toBeUndefined();
    expect(body.results).toHaveLength(1); // keyword results are unaffected
  });

  it("omits `related` and does not fail the response when semantic search throws", async () => {
    mockFetch.mockResolvedValueOnce(
      quranComResponse([{ verse_key: "1:3", translations: [{ text: "the Lord of Mercy" }] }])
    );
    mockSearchByMeaning.mockRejectedValueOnce(new Error("no embeddings"));

    const res = await GET(makeSearchReq("mercy"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.related).toBeUndefined();
    expect(body.results.map((r: { ref: string }) => r.ref)).toEqual(["1:3"]);
  });

  it("does not attempt semantic search beyond page 1", async () => {
    mockFetch.mockResolvedValueOnce(quranComResponse([]));
    await GET(makeSearchReq("mercy", "&page=2"));
    expect(mockSearchByMeaning).not.toHaveBeenCalled();
  });

  it("skips semantic search (without 429ing the keyword response) when its own rate-limit budget is exhausted", async () => {
    mockConsume.mockImplementation(async (key: string) => !key.startsWith("search:"));
    mockFetch.mockResolvedValueOnce(
      quranComResponse([{ verse_key: "2:1", translations: [{ text: "Alif Lam Mim" }] }])
    );
    const res = await GET(makeSearchReq("mercy"));
    expect(res.status).toBe(200);
    expect(mockSearchByMeaning).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.related).toBeUndefined();
    expect(body.results[0].ref).toBe("2:1");
  });

  it("rate-limits the semantic lookup under the last (proxy-appended) hop of x-forwarded-for", async () => {
    mockFetch.mockResolvedValueOnce(quranComResponse([]));
    mockSearchByMeaning.mockResolvedValueOnce([]);
    await GET(makeSearchReq("mercy", "", { "x-forwarded-for": "203.0.113.7, 70.41.3.18" }));
    expect(mockConsume).toHaveBeenCalledWith("search:70.41.3.18");
  });

  it("logs a separate 'meaning' search-log entry when related results are found", async () => {
    mockFetch.mockResolvedValueOnce(quranComResponse([]));
    mockSearchByMeaning.mockResolvedValueOnce([semanticMatch("94:5", "...")]);
    await GET(makeSearchReq("mercy"));
    expect(mockLogSearchQuery).toHaveBeenCalledWith("mercy", "keyword", 0);
    expect(mockLogSearchQuery).toHaveBeenCalledWith("mercy", "meaning", 1);
  });

  it("does not log a 'meaning' search-log entry when nothing semantic was found", async () => {
    mockFetch.mockResolvedValueOnce(quranComResponse([]));
    mockSearchByMeaning.mockResolvedValueOnce([]);
    await GET(makeSearchReq("mercy"));
    expect(mockLogSearchQuery).toHaveBeenCalledWith("mercy", "keyword", 0);
    expect(mockLogSearchQuery).not.toHaveBeenCalledWith("mercy", "meaning", expect.anything());
  });

  it("rate-limits the keyword search response when the search budget is exhausted", async () => {
    mockFetch.mockResolvedValueOnce(
      quranComResponse([{ verse_key: "1:1", translations: [{ text: "In the name of God" }] }])
    );
    mockConsume.mockResolvedValue(false);
    const res = await GET(makeSearchReq("mercy"));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe("Too many search requests");
  });

  it("gates plain keyword search under its own bucket, distinct from the AI-generation budget the semantic lookup uses", async () => {
    mockFetch.mockResolvedValueOnce(quranComResponse([]));
    await GET(makeSearchReq("mercy"));
    expect(mockConsume).toHaveBeenCalledWith(expect.stringMatching(/^searchkw:/), 60, 60);
    // The semantic "related" lookup still uses its own separate "search:" bucket
    // (with no explicit limit/window args — that budget already has its own default).
    expect(mockConsume).toHaveBeenCalledWith(expect.stringMatching(/^search:/));
  });

  it("rate-limits the search-log write on the keyword path, within budget", async () => {
    mockFetch.mockResolvedValueOnce(quranComResponse([]));
    await GET(makeSearchReq("mercy"));
    expect(mockConsume).toHaveBeenCalledWith(expect.stringMatching(/^searchlog:/), 30, 60);
    expect(mockLogSearchQuery).toHaveBeenCalledWith("mercy", "keyword", 0);
  });

  it("skips the search-log write once the per-client log budget is exhausted", async () => {
    mockFetch.mockResolvedValueOnce(quranComResponse([]));
    mockConsume.mockResolvedValue(false);
    await GET(makeSearchReq("mercy"));
    expect(mockLogSearchQuery).not.toHaveBeenCalled();
  });

  it("passes the caller's cookie-selected edition through to semantic search", async () => {
    mockGetQuranEdition.mockResolvedValue("ru.kuliev");
    mockFetch.mockResolvedValueOnce(quranComResponse([]));
    mockSearchByMeaning.mockResolvedValueOnce([semanticMatch("94:5", "...")]);
    await GET(makeSearchReq("mercy"));
    expect(mockSearchByMeaning).toHaveBeenCalledWith("mercy", 15, "ru.kuliev");
  });

  it("resolves ref-format queries against the caller's cookie-selected edition", async () => {
    mockGetQuranEdition.mockResolvedValue("ru.kuliev");
    mockGetVerse.mockResolvedValueOnce(verse("2:255", "Аллах - нет божества, кроме Него."));
    await GET(makeSearchReq("2:255"));
    expect(mockGetVerse).toHaveBeenCalledWith("2:255", "ru.kuliev");
  });

  it("hydrates keyword-search results against the caller's cookie-selected edition", async () => {
    mockGetQuranEdition.mockResolvedValue("az.mammadaliyev");
    mockFetch.mockResolvedValueOnce(
      quranComResponse([{ verse_key: "2:30", translations: [{ text: "..." }] }])
    );
    await GET(makeSearchReq("mercy"));
    expect(mockGetVerses).toHaveBeenCalledWith(["2:30"], "az.mammadaliyev");
  });

  describe("surah-name queries", () => {
    it("returns a matchedSurahs payload with no ayah results for an exact surah-name query", async () => {
      const res = await GET(makeSearchReq("kahf"));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.results).toEqual([]);
      expect(body.matchedSurahs).toEqual([
        { number: 18, name: "Al-Kahf", nameArabic: "الكهف", ayahCount: 110 },
      ]);
      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockSearchByMeaning).not.toHaveBeenCalled();
    });

    it("takes priority over the normal keyword search path", async () => {
      await GET(makeSearchReq("Al-Fatiha"));
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("does not match a topical query as a surah name", async () => {
      mockFetch.mockResolvedValueOnce(quranComResponse([]));
      const res = await GET(makeSearchReq("mercy"));
      const body = await res.json();
      expect(body.matchedSurahs).toBeUndefined();
      expect(mockFetch).toHaveBeenCalled();
    });

    it("lists every surah matching a partial name, in ascending order", async () => {
      const res = await GET(makeSearchReq("ba"));
      const body = await res.json();
      expect(body.matchedSurahs.map((s: { number: number }) => s.number)).toEqual([2, 90, 98]);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("passes the caller's UI locale to the localized chapter-name fetch", async () => {
      mockGetUiLocale.mockResolvedValue("tr");
      await GET(makeSearchReq("kahf"));
      expect(mockFetchLocalizedChapterNames).toHaveBeenCalledWith("tr");
    });

    it("matches a surah via its localized name for the caller's UI locale", async () => {
      mockGetUiLocale.mockResolvedValue("ru");
      mockFetchLocalizedChapterNames.mockResolvedValue(new Map([[18, "Пещера"]]));
      const res = await GET(makeSearchReq("Пещера"));
      const body = await res.json();
      expect(body.matchedSurahs).toEqual([
        { number: 18, name: "Al-Kahf", nameArabic: "الكهف", ayahCount: 110 },
      ]);
    });
  });
});
