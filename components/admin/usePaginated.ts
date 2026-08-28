"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AdminApiError } from "./AdminContext";

/** One page of results plus whether more exist, and any non-row payload. */
export interface Page<Row, Extra = undefined> {
  rows: Row[];
  hasMore: boolean;
  extra?: Extra;
}

interface PaginatedState<Row, Extra> {
  rows: Row[];
  extra: Extra | null;
  hasMore: boolean;
  /** Initial load (page 0) in flight. */
  loading: boolean;
  /** A `loadMore()` append in flight. */
  loadingMore: boolean;
  /** Initial load failed. */
  error: string | null;
  /** A `loadMore()` append failed (rows already on screen are kept). */
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
    if (loadingMore) return;
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
  }, [loadingMore, rows.length]);

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
