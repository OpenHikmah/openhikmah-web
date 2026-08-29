"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AdminApiError } from "./AdminContext";

export interface Page<Row, Extra = undefined> {
  rows: Row[];
  hasMore: boolean;
  extra?: Extra;
}

interface PaginatedState<Row, Extra> {
  rows: Row[];
  extra: Extra | null;
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  /** A `loadMore()` append failed — rows already on screen are kept. */
  loadMoreError: boolean;
  reload: () => void;
  loadMore: () => void;
}

/**
 * List pagination for admin pages: runs `fetchPage({ offset: 0 })` on mount and
 * whenever `cacheKey` changes (encode filters into the key), then appends later
 * pages via `loadMore()`. Generalises the tail-append logic that was inlined in
 * the audit page. `fetchPage` should call `useAdminFetch` and may throw
 * `AdminApiError`.
 *
 * Stale-response guard: a `reload()` or `cacheKey` change bumps a generation
 * counter; a slow page-0 or loadMore response from a superseded generation is
 * dropped rather than merged into the wrong list.
 */
export function usePaginated<Row, Extra = undefined>(
  fetchPage: (args: { offset: number }) => Promise<Page<Row, Extra>>,
  cacheKey: string
): PaginatedState<Row, Extra> {
  const [rows, setRows] = useState<Row[]>([]);
  const [extra, setExtra] = useState<Extra | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const [tick, setTick] = useState(0);

  const fetchRef = useRef(fetchPage);
  useEffect(() => {
    fetchRef.current = fetchPage;
  });

  // Bumped on every reload / cacheKey change so a superseded in-flight request
  // can detect it's stale and skip applying its result.
  const generation = useRef(0);

  useEffect(() => {
    generation.current += 1;
    const gen = generation.current;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    setLoadMoreError(false);
    // A page-0 reload supersedes any in-flight append: its stale `finally` is
    // guarded out, so clear the flag here or the Load-more button stays disabled.
    setLoadingMore(false);

    fetchRef
      .current({ offset: 0 })
      .then((page) => {
        if (gen !== generation.current) return;
        setRows(page.rows);
        setExtra(page.extra ?? null);
        setHasMore(page.hasMore);
      })
      .catch((e: unknown) => {
        if (gen !== generation.current) return;
        setRows([]);
        setExtra(null);
        setHasMore(false);
        setError(e instanceof AdminApiError ? e.message : "Something went wrong");
      })
      .finally(() => {
        if (gen === generation.current) setLoading(false);
      });
  }, [cacheKey, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  const loadMore = useCallback(() => {
    // Don't append while page 0 is (re)loading — `reload()` keeps `rows`/`hasMore`
    // but the offset is about to be reset, so a mid-flight append would splice a
    // later page onto a list page 0 is replacing. Also stop once exhausted.
    if (loadingMore || loading || !hasMore) return;
    const gen = generation.current;
    setLoadingMore(true);
    setLoadMoreError(false);
    fetchRef
      .current({ offset: rows.length })
      .then((page) => {
        if (gen !== generation.current) return;
        setRows((prev) => [...prev, ...page.rows]);
        setHasMore(page.hasMore);
      })
      .catch(() => {
        if (gen === generation.current) setLoadMoreError(true);
      })
      .finally(() => {
        if (gen === generation.current) setLoadingMore(false);
      });
  }, [loadingMore, loading, hasMore, rows.length]);

  return {
    rows,
    extra,
    hasMore,
    loading,
    loadingMore,
    error,
    loadMoreError,
    reload,
    loadMore,
  };
}
