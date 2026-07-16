"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Search, Network, Heart, BookOpen } from "lucide-react";
import { LandingHeader } from "@/components/layout/LandingHeader";
import { MobileNavBar } from "@/components/layout/MobileNavBar";
import { SearchModeToggle, type SearchMode } from "@/components/search/SearchModeToggle";
import { Card, Input, IconButton, Tooltip, Pagination, buttonVariants } from "@/components/ui";
import { useAuthStore } from "@/store/auth";
import { cn } from "@/lib/utils";
import type { SearchResponse, SearchResult } from "@/types/quran";

const PAGE_SIZE = 20;

// Curated starting points for the empty state — natural-language topics search
// best in "meaning" mode, so chips navigate there rather than defaulting to Keyword.
const EXAMPLE_SEARCHES = [
  "2:255 — Ayat al-Kursi",
  "Patience",
  "Mercy",
  "Gratitude",
  "Forgiveness",
  "The Night Journey",
];

function buildHref(q: string, mode: SearchMode, page: number) {
  const params = new URLSearchParams({ q, type: mode, page: String(page) });
  return `/search?${params.toString()}`;
}

export function SearchPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const q = searchParams.get("q") ?? "";
  const mode: SearchMode = searchParams.get("type") === "meaning" ? "meaning" : "keyword";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);

  const [inputValue, setInputValue] = useState(q);
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(!!q.trim());
  const [error, setError] = useState(false);
  const [fellBackToKeyword, setFellBackToKeyword] = useState(false);
  // Keyword search calls an upstream API — this distinguishes "the search itself
  // failed" from a genuine zero-match result, which call for different copy.
  const [keywordUnavailable, setKeywordUnavailable] = useState(false);
  // Bumped by the "Try again" button so the fetch effect re-runs even when
  // q/mode/page are unchanged (router.replace to the same URL is a no-op).
  const [retryCount, setRetryCount] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the input in sync when navigating via browser back/forward.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInputValue(q);
  }, [q]);

  // Clear pending debounce on unmount to avoid a stale navigation firing
  // after the user has already clicked away (e.g. to "Map on Canvas").
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  useEffect(() => {
    abortRef.current?.abort();
    const trimmed = q.trim();
    if (!trimmed) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setData(null);
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(false);
    setFellBackToKeyword(false);
    setKeywordUnavailable(false);

    fetch(
      `/api/search?q=${encodeURIComponent(trimmed)}${
        mode === "meaning" ? "&mode=meaning" : ""
      }&page=${page}&pageSize=${PAGE_SIZE}`,
      { signal: controller.signal }
    )
      .then(async (res) => {
        if (!res.ok) throw new Error();
        const json: SearchResponse = await res.json();
        setFellBackToKeyword(
          mode === "meaning" && res.headers.get("x-search-fallback") === "keyword"
        );
        setKeywordUnavailable(res.headers.get("x-search-error") === "keyword-unavailable");
        setData(json);
      })
      .catch((err) => {
        if ((err as Error).name !== "AbortError") {
          setError(true);
          setData({ results: [], total: 0, page, pageSize: PAGE_SIZE });
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [q, mode, page, retryCount]);

  const navigate = useCallback(
    (nextQ: string, nextMode: SearchMode, nextPage: number) => {
      if (!nextQ.trim()) {
        router.replace("/search");
        return;
      }
      router.replace(buildHref(nextQ.trim(), nextMode, nextPage));
    },
    [router]
  );

  const onInputChange = (value: string) => {
    setInputValue(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => navigate(value, mode, 1), 400);
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="min-h-screen bg-bg pb-[calc(72px+env(safe-area-inset-bottom))] text-text-primary md:pb-0">
      <LandingHeader />
      <MobileNavBar />

      <div className="mx-auto w-full max-w-[800px] px-6 py-10">
        {/* Search bar */}
        <div className="mb-4 flex items-center gap-3">
          <Search className="h-4 w-4 shrink-0 text-text-muted" />
          <Input
            value={inputValue}
            onChange={(e) => onInputChange(e.target.value)}
            aria-label="Search verses"
            placeholder={
              mode === "meaning"
                ? "Describe a meaning, e.g. trusting God in hardship…"
                : "Search topics, or enter a ref like 2:255…"
            }
            className="flex-1"
          />
        </div>
        <SearchModeToggle mode={mode} onChange={(m) => navigate(q, m, 1)} className="mb-6" />

        {!q.trim() ? (
          <div className="py-16 text-center">
            <Search className="mx-auto mb-4 h-8 w-8 text-text-muted/40" />
            <p className="mb-6 text-sm text-text-muted">Enter a search term to get started.</p>
            <div className="mx-auto flex max-w-md flex-wrap justify-center gap-2">
              {EXAMPLE_SEARCHES.map((example) => {
                // Ref-shaped examples (e.g. "2:255 — Ayat al-Kursi") search fine in either
                // mode; plain topics only work in "meaning" mode.
                const isRef = /^\d+:\d+/.test(example);
                const [term] = example.split(" — ");
                return (
                  <button
                    key={example}
                    type="button"
                    onClick={() => navigate(term, isRef ? "keyword" : "meaning", 1)}
                    className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-text-secondary transition-colors hover:border-teal/40 hover:text-teal-bright"
                  >
                    {example}
                  </button>
                );
              })}
            </div>
          </div>
        ) : loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="animate-pulse rounded-xl border border-border bg-surface p-5">
                <div className="mb-4 flex items-center gap-2">
                  <div className="h-5 w-14 rounded bg-surface-overlay" />
                  <div className="h-4 w-24 rounded bg-surface-overlay" />
                </div>
                <div className="mb-2 h-5 w-full rounded bg-surface-overlay" />
                <div className="h-4 w-3/4 rounded bg-surface-overlay" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="py-20 text-center">
            <p className="text-sm text-text-muted">Something went wrong. Try again.</p>
          </div>
        ) : !data || data.results.length === 0 ? (
          <div className="py-20 text-center">
            <BookOpen className="mx-auto mb-4 h-8 w-8 text-text-muted/40" />
            <p className="text-sm text-text-muted">
              {keywordUnavailable
                ? "Search is temporarily unavailable."
                : mode === "meaning"
                  ? "No verses matched that meaning."
                  : "No exact matches."}
            </p>
            {keywordUnavailable ? (
              <button
                type="button"
                onClick={() => setRetryCount((c) => c + 1)}
                className="mt-3 text-sm text-teal-bright hover:underline"
              >
                Try again →
              </button>
            ) : (
              mode === "keyword" && (
                <button
                  type="button"
                  onClick={() => navigate(q, "meaning", 1)}
                  className="mt-3 text-sm text-teal-bright hover:underline"
                >
                  Try &ldquo;By meaning&rdquo; search instead →
                </button>
              )
            )}
          </div>
        ) : (
          <>
            <p className="mb-4 text-sm text-text-muted">
              Showing <span className="font-medium text-text-primary">{data.total}</span> result
              {data.total === 1 ? "" : "s"} for &ldquo;{q}&rdquo;
            </p>
            {fellBackToKeyword && (
              <p className="mb-4 text-xs text-text-muted">
                Meaning-based results aren&rsquo;t ready for this query yet — showing keyword
                matches instead.
              </p>
            )}
            <div className="space-y-3">
              {data.results.map((result) => (
                <ResultCard key={result.ref} result={result} />
              ))}
            </div>
            <Pagination
              page={page}
              totalPages={totalPages}
              href={(p) => buildHref(q, mode, p)}
              className="mt-8"
            />
          </>
        )}
      </div>
    </div>
  );
}

function ResultCard({ result }: { result: SearchResult }) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const isBookmarked = useAuthStore((s) => s.isBookmarked(result.ref));
  const toggleBookmark = useAuthStore((s) => s.toggleBookmark);

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="rounded border border-gold bg-gold/[0.08] px-1.5 py-0.5 font-mono text-xs text-gold">
            {result.ref}
          </span>
          <span className="text-xs text-text-muted">{result.surahName}</span>
        </div>
        <div className="flex items-center gap-2">
          {accessToken && (
            <Tooltip label={isBookmarked ? "Remove bookmark" : "Bookmark verse"}>
              <IconButton
                tone="gold"
                size="xs"
                onClick={() => toggleBookmark(result.ref)}
                aria-label={isBookmarked ? "Remove bookmark" : "Bookmark verse"}
                className={cn(isBookmarked && "border-gold-muted text-gold")}
              >
                <Heart fill={isBookmarked ? "currentColor" : "none"} />
              </IconButton>
            </Tooltip>
          )}
          <Link
            href={`/canvas?verse=${result.ref}`}
            className={buttonVariants({ variant: "primary", size: "sm" })}
          >
            <Network className="w-3.5 h-3.5" />
            Map on Canvas
          </Link>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <p className="font-arabic text-right text-lg leading-loose text-text-primary">
          {result.arabicText}
        </p>
        <p className="text-sm leading-relaxed text-text-secondary">{result.translation}</p>
      </div>
    </Card>
  );
}
