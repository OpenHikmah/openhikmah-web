import { sql } from "drizzle-orm";
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

/** Default generation budget per client, per window (overridable via env). */
export const AI_GEN_LIMIT = Number(process.env.AI_GEN_RATE_LIMIT ?? 20);
export const AI_GEN_WINDOW_SECONDS = Number(process.env.AI_GEN_RATE_WINDOW ?? 60);

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
    return count <= limit;
  } catch (err) {
    console.error("Rate limiter error (failing open):", err);
    return true;
  }
}
