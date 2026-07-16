import { NextRequest, NextResponse } from "next/server";
import type { SearchResponse, SearchResult, VerseRef } from "@/types/quran";
import { getSurahName } from "@/lib/quran/surah-names";
import { searchByMeaning } from "@/lib/quran/semantic-search";
import { getVerse, getVerses } from "@/lib/quran/quran-corpus";
import { consume, SEARCH_LOG_LIMIT, SEARCH_LOG_WINDOW_SECONDS } from "@/lib/infra/rate-limit";
import { clientKey } from "@/lib/infra/http";
import { logSearchQuery } from "@/lib/infra/search-log";
import sanitizeHtml from "sanitize-html";

const MAX_QUERY_LENGTH = 200;
const SEMANTIC_RESULT_CAP = 100;

interface KeywordSearchResult {
  results: SearchResult[];
  total: number;
  /** True when the upstream call itself failed (network error, non-2xx) — as opposed
   *  to succeeding with genuinely zero matches. The client needs this distinction:
   *  "the search broke" and "nothing matched" call for different user-facing copy. */
  failed?: boolean;
}

/** Keyword search via the quran.com full-text API. Returns empty (and `failed: true`)
 *  on any failure, rather than treating it identically to a real zero-result search. */
async function keywordSearch(
  q: string,
  page: number,
  pageSize: number
): Promise<KeywordSearchResult> {
  try {
    const url = `https://api.quran.com/api/v4/search?q=${encodeURIComponent(q)}&size=${pageSize}&language=en&page=${page}`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: 300 },
    });
    if (!res.ok) {
      console.error(`Search API error: ${res.status} ${res.statusText}`);
      return { results: [], total: 0, failed: true };
    }
    const data = await res.json();
    const rawResults = (data?.search?.results ?? []) as Array<{
      verse_key?: string;
      translations?: Array<{ text?: string }>;
    }>;
    const results = rawResults
      .filter((r): r is { verse_key: string; translations?: Array<{ text?: string }> } =>
        Boolean(r.verse_key && /^\d+:\d+$/.test(r.verse_key))
      )
      .map((r) => {
        const [surahStr] = r.verse_key.split(":");
        const surahNum = parseInt(surahStr, 10);
        const [surahName, surahNameArabic] = getSurahName(surahNum);
        const snippet = sanitizeHtml(r.translations?.[0]?.text ?? "", {
          allowedTags: [],
          allowedAttributes: {},
        }).slice(0, 140);
        return {
          ref: r.verse_key as VerseRef,
          surahName,
          surahNameArabic,
          snippet,
        };
      });
    return {
      results: await hydrate(results),
      total: data?.search?.total_results ?? results.length,
    };
  } catch (err) {
    console.error("Keyword search error:", err);
    return { results: [], total: 0, failed: true };
  }
}

/** Fills in `arabicText`/`translation` from our own corpus so the full-text view
 *  always shows the same text as the rest of the app, regardless of source. */
async function hydrate(
  partial: Array<Omit<SearchResult, "arabicText" | "translation">>
): Promise<SearchResult[]> {
  const verseMap = await getVerses(partial.map((r) => r.ref));
  return partial.map((r) => {
    const verse = verseMap.get(r.ref);
    return {
      ...r,
      arabicText: verse?.arabicText ?? "",
      translation: verse?.translation ?? r.snippet,
    };
  });
}

/**
 * Records a search query for analytics, but only within a per-client budget.
 * Gating the *write* (not the response) keeps scripted/spam traffic from
 * growing search_log unbounded while still serving results normally.
 */
async function maybeLogSearchQuery(
  req: NextRequest,
  query: string,
  mode: "keyword" | "meaning",
  resultCount: number
): Promise<void> {
  const allowed = await consume(
    `searchlog:${clientKey(req)}`,
    SEARCH_LOG_LIMIT,
    SEARCH_LOG_WINDOW_SECONDS
  );
  if (allowed) {
    await logSearchQuery(query, mode, resultCount);
  }
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  const page = Math.max(1, parseInt(req.nextUrl.searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.max(
    1,
    Math.min(parseInt(req.nextUrl.searchParams.get("pageSize") ?? "10", 10) || 10, 50)
  );

  if (!q) {
    return NextResponse.json({ error: "Missing query" }, { status: 400 });
  }
  if (q.length > MAX_QUERY_LENGTH) {
    return NextResponse.json({ error: "Query too long" }, { status: 400 });
  }

  if (/^\d+:\d+$/.test(q)) {
    const verse = await getVerse(q);
    const [surahName, surahNameArabic] = getSurahName(parseInt(q.split(":")[0], 10));
    const result: SearchResult = {
      ref: q as VerseRef,
      surahName: verse?.surahName ?? surahName,
      surahNameArabic: verse?.surahNameArabic ?? surahNameArabic,
      snippet: verse?.translation ?? `${surahName} ${q.split(":")[1]}`,
      arabicText: verse?.arabicText ?? "",
      translation: verse?.translation ?? "",
    };
    const response: SearchResponse = { results: [result], total: 1, page: 1, pageSize };
    return NextResponse.json(response);
  }

  // Semantic ("by meaning") mode — ranks the local corpus by embedding similarity.
  // It can come up empty for benign reasons: embeddings not yet seeded, the embedding
  // provider unavailable, the free-tier quota exhausted, or this caller hitting the
  // per-IP limit. In all of those we fall back to free keyword search so "by meaning"
  // is never blank, and it self-upgrades to true semantic results once embeddings exist.
  if (req.nextUrl.searchParams.get("mode") === "meaning") {
    const allowed = await consume(`search:${clientKey(req)}`);
    if (allowed) {
      try {
        const matches = await searchByMeaning(q, SEMANTIC_RESULT_CAP);
        if (matches.length > 0) {
          const total = Math.min(SEMANTIC_RESULT_CAP, matches.length);
          const start = (page - 1) * pageSize;
          const pageMatches = matches.slice(start, start + pageSize);
          const results: SearchResult[] = pageMatches.map((m) => ({
            ref: m.verse.ref,
            surahName: m.verse.surahName,
            surahNameArabic: m.verse.surahNameArabic,
            snippet: m.verse.translation.slice(0, 140),
            arabicText: m.verse.arabicText,
            translation: m.verse.translation,
          }));
          const response: SearchResponse = { results, total, page, pageSize };
          await maybeLogSearchQuery(req, q, "meaning", total);
          return NextResponse.json(response);
        }
      } catch (err) {
        console.error("Semantic search route error:", err);
      }
    }
    const { results, total, failed } = await keywordSearch(q, page, pageSize);
    const response: SearchResponse = { results, total, page, pageSize };
    await maybeLogSearchQuery(req, q, "keyword", total);
    return NextResponse.json(response, {
      headers: {
        "x-search-fallback": "keyword",
        ...(failed ? { "x-search-error": "keyword-unavailable" } : {}),
      },
    });
  }

  const allowed = await consume(`search:${clientKey(req)}`);
  if (!allowed) {
    return NextResponse.json({ error: "Too many search requests" }, { status: 429 });
  }
  const { results, total, failed } = await keywordSearch(q, page, pageSize);
  const response: SearchResponse = { results, total, page, pageSize };
  await maybeLogSearchQuery(req, q, "keyword", total);
  return NextResponse.json(response, {
    headers: failed ? { "x-search-error": "keyword-unavailable" } : {},
  });
}
