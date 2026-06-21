"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AdminApiError } from "./AdminContext";

interface AsyncState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
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
        setData(null); // drop stale data so we never render "error + old rows"
        setError(e instanceof AdminApiError ? e.message : "Something went wrong");
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [cacheKey, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload };
}
