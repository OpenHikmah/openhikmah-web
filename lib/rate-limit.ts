import { lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { rateLimits } from "@/lib/db/schema";

/**
 * Fixed-window rate limiter backed by Postgres (no Redis). Guards the expensive
 * AI generation path so a single client can't run up the API bill. Cache hits
 * are not limited — only actual generations consume budget.
 *
 * Redis is the upgrade path once traffic warrants it; the interface stays the same.
 */

export class RateLimitError extends Error {
  constructor(message = "Rate limit exceeded") {
    super(message);
    this.name = "RateLimitError";
  }
}

/**
 * Parses a positive-integer env var, falling back to `fallback` for missing or
 * invalid values (non-numeric, 0, negative, fractional, Infinity). Guards the
 * bucketing math below from NaN/Infinity, which would collapse all requests
 * into one bucket or block everyone.
 */
export function positiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/** Default generation budget per client, per window (overridable via env). */
export const AI_GEN_LIMIT = positiveIntEnv("AI_GEN_RATE_LIMIT", 20);
export const AI_GEN_WINDOW_SECONDS = positiveIntEnv("AI_GEN_RATE_WINDOW", 60);

/** Probability that a given `consume` call also prunes expired buckets. */
const SWEEP_PROBABILITY = 0.01;
/** Keep this many windows of history before a bucket is eligible for pruning. */
const SWEEP_RETENTION_WINDOWS = 10;

/**
 * Deletes rate-limit buckets older than `olderThanSeconds`. Only buckets for the
 * current (and the immediately preceding) window matter; everything older is dead
 * weight. Exported so a cron job can call it directly if preferred over the
 * opportunistic sweep below.
 */
export async function sweepRateLimits(olderThanSeconds: number): Promise<void> {
  const cutoff = new Date(Date.now() - olderThanSeconds * 1000);
  await db.delete(rateLimits).where(lt(rateLimits.createdAt, cutoff));
}

/**
 * Fire-and-forget, low-probability pruning of expired buckets. Wrapped so it can
 * never throw into — or otherwise affect — the limit decision in `consume`.
 */
function maybeSweep(windowSeconds: number): void {
  try {
    if (Math.random() >= SWEEP_PROBABILITY) return;
    void sweepRateLimits(windowSeconds * SWEEP_RETENTION_WINDOWS).catch(() => {});
  } catch {
    // Never let cleanup affect rate limiting.
  }
}

/**
 * Records a hit for `key` and returns true if still within `limit` for the
 * current window. Fails open (returns true) if the limiter itself errors — we
 * never want a limiter outage to take down the feature.
 */
export async function consume(
  key: string,
  limit: number = AI_GEN_LIMIT,
  windowSeconds: number = AI_GEN_WINDOW_SECONDS
): Promise<boolean> {
  const bucket = Math.floor(Date.now() / 1000 / windowSeconds);
  const rowKey = `${key}:${bucket}`;

  try {
    const rows = await db
      .insert(rateLimits)
      .values({ key: rowKey, count: 1 })
      .onConflictDoUpdate({
        target: rateLimits.key,
        set: { count: sql`${rateLimits.count} + 1` },
      })
      .returning({ count: rateLimits.count });

    const count = rows[0]?.count ?? 1;
    maybeSweep(windowSeconds);
    return count <= limit;
  } catch (err) {
    console.error("Rate limiter error (failing open):", err);
    return true;
  }
}
