import { NextResponse } from "next/server";
import { lt, sql } from "drizzle-orm";
import { db } from "@/lib/infra/db";
import { rateLimits } from "@/lib/infra/db/schema";
import { redisIncrWithTtl } from "@/lib/infra/redis";
import { incr } from "@/lib/infra/metrics";
import { getFlagNumber } from "@/lib/admin/feature-flags";

/**
 * Fixed-window rate limiter. Guards the expensive AI generation path so a single
 * client can't run up the API bill. Cache hits are not limited — only actual
 * generations consume budget.
 *
 * Counts live in Redis when configured (atomic INCR+EXPIRE, no DB contention) and
 * fall back to a Postgres counter when Redis is absent or erroring — so the same
 * limit is enforced regardless of which backend is available.
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

/**
 * Default budget for cheap-but-abusable authenticated mutations (friend
 * requests, notes, saved canvases, activity pings, challenge invites) — these
 * have no per-generation cost like the AI path, but an authenticated user
 * with no volume cap can still spam rows or degrade the DB. Generous enough
 * that no real usage pattern hits it.
 */
export const MUTATION_LIMIT = positiveIntEnv("MUTATION_RATE_LIMIT", 60);
export const MUTATION_WINDOW_SECONDS = positiveIntEnv("MUTATION_RATE_WINDOW", 600);

/**
 * Default budget for search-log writes per client — the search endpoints
 * themselves are intentionally unauthenticated and unlimited (see
 * app/api/search/route.ts), but the DB write that records each query for
 * analytics must not grow unbounded under scripted/spam traffic. Gating only
 * the write (not the search response) means abusive traffic still gets
 * results, it just stops being logged past the budget.
 */
export const SEARCH_LOG_LIMIT = positiveIntEnv("SEARCH_LOG_RATE_LIMIT", 30);
export const SEARCH_LOG_WINDOW_SECONDS = positiveIntEnv("SEARCH_LOG_RATE_WINDOW", 60);

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
 *
 * When `limit`/`windowSeconds` are omitted, they resolve from the
 * `ai_gen_limit` / `ai_gen_window_seconds` admin flags (falling back to
 * AI_GEN_LIMIT / AI_GEN_WINDOW_SECONDS) so an operator can tune the AI-gen
 * budget without a redeploy. Callers that pass explicit values (routes with
 * their own budget) are unaffected by the flags.
 */
export async function consume(
  key: string,
  limit?: number,
  windowSeconds?: number
): Promise<boolean> {
  const resolvedLimit = limit ?? (await getFlagNumber("ai_gen_limit", AI_GEN_LIMIT));
  const resolvedWindow =
    windowSeconds ?? (await getFlagNumber("ai_gen_window_seconds", AI_GEN_WINDOW_SECONDS));
  return consumeWith(key, resolvedLimit, resolvedWindow);
}

async function consumeWith(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const bucket = Math.floor(Date.now() / 1000 / windowSeconds);
  const rowKey = `${key}:${bucket}`;

  // Prefer Redis: atomic, no Postgres write contention. Expire after two windows
  // so the bucket key self-cleans. Returns null when Redis is disabled/erroring,
  // in which case we fall through to the Postgres counter below.
  const redisCount = await redisIncrWithTtl(`rl:${rowKey}`, windowSeconds * 2);
  if (redisCount !== null) {
    const allowed = redisCount <= limit;
    incr(allowed ? "ratelimit_allow" : "ratelimit_block");
    return allowed;
  }

  // Redis unavailable → Postgres fallback. Count it so a silent Redis outage is
  // visible on /api/metrics rather than only inferable from missing allow/block.
  incr("ratelimit_redis_fallback");

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
    const allowed = count <= limit;
    incr(allowed ? "ratelimit_allow" : "ratelimit_block");
    return allowed;
  } catch (err) {
    // Fail open so a limiter outage never takes the feature down — but emit a
    // counter, because a security control that stops enforcing under load (e.g.
    // a correlated Redis+DB outage) must not do so without a signal.
    incr("ratelimit_fail_open");
    console.error("Rate limiter error (failing open):", err);
    return true;
  }
}

/**
 * `consume` + "return a 429" was repeated near-identically across every
 * mutation route (notes, friends, workspace, activity, challenges). Centralizes
 * the limit/window pairing and the 429 envelope so future changes (Retry-After,
 * per-route metrics) are a one-file edit. Returns `null` when the request is
 * allowed, or the `NextResponse` the caller should return immediately.
 *
 * When `limit`/`windowSeconds` are omitted, they resolve from the
 * `mutation_limit` / `mutation_window_seconds` admin flags (falling back to
 * MUTATION_LIMIT / MUTATION_WINDOW_SECONDS). Callers that pass explicit
 * values (routes with their own budget) are unaffected by the flags.
 */
export async function rateLimitOrNull(
  key: string,
  message: string,
  limit?: number,
  windowSeconds?: number
): Promise<NextResponse | null> {
  const resolvedLimit = limit ?? (await getFlagNumber("mutation_limit", MUTATION_LIMIT));
  const resolvedWindow =
    windowSeconds ?? (await getFlagNumber("mutation_window_seconds", MUTATION_WINDOW_SECONDS));
  const allowed = await consumeWith(key, resolvedLimit, resolvedWindow);
  return allowed ? null : NextResponse.json({ error: message }, { status: 429 });
}
