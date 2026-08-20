import { NextRequest, NextResponse } from "next/server";
import type { MatchedSurah, SearchResponse, SearchResult, VerseRef } from "@/types/quran";
import { getSurahName, matchSurahsByQuery } from "@/lib/quran/surah-names";
import { fetchLocalizedChapterNames } from "@/lib/quran/chapters";
import { SURAH_LENGTHS } from "@/lib/quran/audio";
import { searchByMeaning, type SemanticMatch } from "@/lib/quran/semantic-search";
import { getVerses } from "@/lib/quran/quran-corpus";
import { resolveVerse } from "@/lib/quran/verse-resolver";
import {
  consume,
  SEARCH_LOG_LIMIT,
  SEARCH_LOG_WINDOW_SECONDS,
  KEYWORD_SEARCH_LIMIT,
  KEYWORD_SEARCH_WINDOW_SECONDS,
} from "@/lib/infra/rate-limit";
import { clientKey } from "@/lib/infra/http";
import { logSearchQuery } from "@/lib/infra/search-log";
import { getQuranEdition, getUiLocale } from "@/lib/i18n/request-prefs";
import sanitizeHtml from "sanitize-html";

// Keyword/ref search results vary on the oh_edition cookie.
export const dynamic = "force-dynamic";

const MAX_QUERY_LENGTH = 200;
const RELATED_RESULT_CAP = 5;

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
  pageSize: number,
  edition: string
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
      results: await hydrate(results, edition),
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
  partial: Array<Omit<SearchResult, "arabicText" | "translation">>,
  edition: string
): Promise<SearchResult[]> {
  const verseMap = await getVerses(
    partial.map((r) => r.ref),
    edition
  );
  return partial.map((r) => {
    const verse = verseMap.get(r.ref);
    return {
      ...r,
      arabicText: verse?.arabicText ?? "",
      translation: verse?.translation ?? r.snippet,
    };
  });
}

/** Best-effort semantic lookup backing the "related by meaning" section — gated
 *  under the same `search:` (AI-generation) budget as before, but any miss
 *  (unseeded embeddings, provider error, rate limit) is swallowed to an empty
 *  list rather than surfaced, since it's purely supplementary to keyword results. */
async function relatedByMeaning(
  req: NextRequest,
  q: string,
  edition: string
): Promise<SemanticMatch[]> {
  const allowed = await consume(`search:${clientKey(req)}`);
  if (!allowed) return [];
  try {
    return await searchByMeaning(q, RELATED_RESULT_CAP + 10, edition);
  } catch (err) {
    console.error("Semantic search route error:", err);
    return [];
  }
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

  const edition = await getQuranEdition();

  // A query matching a surah name (fully or as a prefix, e.g. "kahf" or "ba")
  // surfaces the matching surah(s) as their own result — not a list of
  // individual ayah snippets — so the user can listen to or read one start to
  // finish. Matches the English name, Arabic name, and (for non-English UI
  // locales) the localized chapter name. See matchSurahsByQuery.
  const uiLocale = await getUiLocale();
  const localizedNames = await fetchLocalizedChapterNames(uiLocale);
  const matchedSurahNumbers = matchSurahsByQuery(q, localizedNames);
  if (matchedSurahNumbers.length > 0) {
    const matchedSurahs: MatchedSurah[] = matchedSurahNumbers.map((num) => {
      const [name, nameArabic] = getSurahName(num);
      return { number: num, name, nameArabic, ayahCount: SURAH_LENGTHS[num - 1] };
    });
    const response: SearchResponse = {
      results: [],
      total: 0,
      page: 1,
      pageSize,
      matchedSurahs,
    };
    return NextResponse.json(response);
  }

  if (/^\d+:\d+$/.test(q)) {
    // resolveVerse falls back to a live alquran.cloud fetch on a local DB
    // failure — unlike a bare getVerse() call, this never crashes the route.
    const verse = await resolveVerse(q, edition);
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

  // Plain keyword search is a cheap proxy call, not an AI generation — its own
  // bucket so normal typing/paging never competes with the AI-generation
  // budget (search: prefix, shared with the best-effort "related by meaning" lookup).
  const allowed = await consume(
    `searchkw:${clientKey(req)}`,
    KEYWORD_SEARCH_LIMIT,
    KEYWORD_SEARCH_WINDOW_SECONDS
  );
  if (!allowed) {
    return NextResponse.json({ error: "Too many search requests" }, { status: 429 });
  }

  // Semantic matches run alongside keyword search, best-effort — only on page 1
  // (a small supplementary section, not paginated) and never surfaced as an error
  // or fallback notice. A miss (unseeded embeddings, quota, rate limit) is simply
  // an empty `related`, invisible to the user.
  const [{ results, total, failed }, semanticMatches] = await Promise.all([
    keywordSearch(q, page, pageSize, edition),
    page === 1 ? relatedByMeaning(req, q, edition) : Promise.resolve([]),
  ]);

  const keywordRefs = new Set(results.map((r) => r.ref));
  const related: SearchResult[] = semanticMatches
    .filter((m) => !keywordRefs.has(m.verse.ref))
    .slice(0, RELATED_RESULT_CAP)
    .map((m) => ({
      ref: m.verse.ref,
      surahName: m.verse.surahName,
      surahNameArabic: m.verse.surahNameArabic,
      snippet: m.verse.translation.slice(0, 140),
      arabicText: m.verse.arabicText,
      translation: m.verse.translation,
    }));

  const response: SearchResponse = {
    results,
    total,
    page,
    pageSize,
    ...(related.length > 0 ? { related } : {}),
  };
  await maybeLogSearchQuery(req, q, "keyword", total);
  if (related.length > 0) {
    await maybeLogSearchQuery(req, q, "meaning", related.length);
  }
  return NextResponse.json(response, {
    headers: failed ? { "x-search-error": "keyword-unavailable" } : {},
  });
}
