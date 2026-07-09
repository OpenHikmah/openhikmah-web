/**
 * Tiny in-process metrics registry. Deliberately dependency-free: it tracks
 * named counters that hot paths bump cheaply, exposed via /api/metrics so we can
 * see the bottleneck (cache hit rates, rate-limit blocks, AI call volume) instead
 * of guessing. Counters are per-process and reset on restart — once the app runs
 * as multiple containers, scrape each instance (standard for this kind of metric).
 */

const counters = new Map<string, number>();

/** Increment a named counter (created on first use). */
export function incr(name: string, by = 1): void {
  counters.set(name, (counters.get(name) ?? 0) + by);
}

/** Current value of every counter, as a plain object for JSON output. */
export function counterSnapshot(): Record<string, number> {
  return Object.fromEntries([...counters.entries()].sort());
}

const startedAtMs = Date.now();

/** Seconds since this process started serving. */
export function uptimeSeconds(): number {
  return Math.floor((Date.now() - startedAtMs) / 1000);
}
