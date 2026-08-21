import { useCallback, useEffect, useRef, useState } from "react";

interface PagedResponse<T> {
  items: T[];
  hasMore: boolean;
}

interface Options<T> {
  /** Bearer token; fetching is skipped entirely while this is falsy. */
  accessToken: string | null;
  /** Extra gate on top of `accessToken` (e.g. the profile hasn't resolved yet). */
  enabled: boolean;
  /** Builds the endpoint URL for a given `limit`/`offset` query string, e.g. `/api/social/friends`. */
  baseUrl: string;
  /** Called with each successful page's items — for side effects like updating a badge count. */
  onData?: (items: T[]) => void;
}

/**
 * Shared paginated-list fetching for the Friends and Leaderboard tabs. Both
 * lists are refetched wholesale (not patched in place) after any mutation, so
 * `refresh()` re-requests the same number of rows already loaded — plus one,
 * since rows are ordered newest-first and a just-created row would otherwise
 * push the previously-last-visible row out of the re-fetched count. There's
 * no cursor-based "give me back what I had, refreshed" API, so this buffer is
 * the refresh contract; centralized here instead of duplicated per list.
 *
 * All fetches are cancelled via AbortController when superseded, so rapid
 * mutations (e.g. accepting two requests back to back) can't resolve out of
 * order and leave stale data in state.
 */
export function usePaginatedSocialList<T>({ accessToken, enabled, baseUrl, onData }: Options<T>) {
  const [items, setItems] = useState<T[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);

  const itemsRef = useRef(items);
  itemsRef.current = items;
  const abortRef = useRef<AbortController | null>(null);
  const onDataRef = useRef(onData);
  onDataRef.current = onData;

  const runFetch = useCallback(
    async (url: string, mode: "replace" | "append") => {
      if (!accessToken) return;
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      if (mode === "replace") setLoading(true);
      else setLoadingMore(true);
      try {
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: ctrl.signal,
        });
        if (!res.ok) {
          if (mode === "replace") setError(true);
          return;
        }
        const data: PagedResponse<T> = await res.json();
        if (mode === "replace") {
          setItems(data.items);
          onDataRef.current?.(data.items);
          setError(false);
        } else {
          setItems((prev) => [...prev, ...data.items]);
        }
        setHasMore(data.hasMore);
      } catch (e) {
        if ((e as { name?: string }).name === "AbortError") return;
        if (mode === "replace") setError(true);
      } finally {
        if (mode === "replace") setLoading(false);
        else setLoadingMore(false);
      }
    },
    [accessToken]
  );

  const refresh = useCallback(() => {
    const count = itemsRef.current.length;
    const url = count > 0 ? `${baseUrl}?limit=${count + 1}` : baseUrl;
    return runFetch(url, "replace");
  }, [baseUrl, runFetch]);

  const loadMore = useCallback(() => {
    if (loadingMore) return Promise.resolve();
    return runFetch(`${baseUrl}?offset=${itemsRef.current.length}`, "append");
  }, [baseUrl, loadingMore, runFetch]);

  useEffect(() => {
    if (!enabled || !accessToken) return;
    refresh();
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, accessToken, baseUrl]);

  return { items, hasMore, loading, loadingMore, error, refresh, loadMore };
}
