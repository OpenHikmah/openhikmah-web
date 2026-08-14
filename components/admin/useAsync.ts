"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AdminApiError } from "./AdminContext";

interface ReloadOptions {
  /**
   * Preserve the last-good `data` when this reload errors, instead of the
   * default "drop stale data so we never render error + old rows". A manual,
   * user-triggered reload should keep the default — but a background poller
   * (e.g. JobRunner's 4s interval) would otherwise wipe the whole table on a
   * single transient blip, hiding an in-progress job's status until the next
   * poll. Per-call (not per-hook) so an action-triggered reload on the same
   * hook instance — e.g. immediately after starting a job — still clears
   * stale data on failure rather than risking the just-started job never
   * appearing because the poll effect reads state that was never refreshed.
   */
  keepDataOnError?: boolean;
}

interface AsyncState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: (options?: ReloadOptions) => void;
}

/**
 * Runs `loader` on mount and whenever `cacheKey` changes (encode any filters the
 * loader reads into the key), exposing loading/error/data plus a manual `reload`.
 * The loader is held in a ref so the effect can depend only on the literal
 * `[cacheKey, tick]` — required by the project's strict react-hooks lint.
 */
export function useAsync<T>(loader: () => Promise<T>, cacheKey: string): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const loaderRef = useRef(loader);
  useEffect(() => {
    loaderRef.current = loader; // keep the latest closure without re-running the load
  });

  const keepDataOnErrorRef = useRef(false);

  useEffect(() => {
    let active = true;
    // Legitimate external-data sync: kick off a fetch and reflect its result.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    loaderRef
      .current()
      .then((d) => active && setData(d))
      .catch((e: unknown) => {
        if (!active) return;
        if (!keepDataOnErrorRef.current) setData(null); // drop stale data so we never render "error + old rows"
        setError(e instanceof AdminApiError ? e.message : "Something went wrong");
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [cacheKey, tick]);

  const reload = useCallback((options?: ReloadOptions) => {
    keepDataOnErrorRef.current = options?.keepDataOnError ?? false;
    setTick((t) => t + 1);
  }, []);
  return { data, error, loading, reload };
}
