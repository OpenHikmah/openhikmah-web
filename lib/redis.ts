import Redis from "ioredis";

/**
 * Shared Redis client + fail-safe helpers.
 *
 * Redis is an OPTIONAL accelerator, never a hard dependency. When `REDIS_URL`
 * is unset the client is disabled and every helper is a no-op (reads return
 * null, writes do nothing) so callers transparently fall back to their previous
 * in-process / Postgres behavior. When `REDIS_URL` is set but Redis is
 * unreachable, helpers swallow the error and degrade the same way — a Redis
 * outage can never take the site down. This is what lets the externalized-state
 * work ship onto the current single box without risk.
 */

// `undefined` = not yet initialized, `null` = explicitly disabled (no REDIS_URL).
let client: Redis | null | undefined;

// Reuse a single client across Next.js dev hot-reloads to avoid leaking
// connections, the same way a global would for any long-lived handle.
const globalForRedis = globalThis as unknown as { __redis?: Redis | null };

/** Returns the shared client, or null when Redis is disabled/unconfigured. */
export function getRedis(): Redis | null {
  if (client !== undefined) return client;
  if (globalForRedis.__redis !== undefined) {
    client = globalForRedis.__redis;
    return client;
  }

  const url = process.env.REDIS_URL;
  if (!url) {
    client = null;
    globalForRedis.__redis = null;
    return null;
  }

  const c = new Redis(url, {
    // Bound every command so a stalled Redis can't hang a request; on failure
    // the helpers below catch and fall back.
    maxRetriesPerRequest: 2,
    // Don't buffer commands while disconnected — fail fast to the fallback path.
    enableOfflineQueue: false,
    connectTimeout: 3000,
    retryStrategy: (times) => Math.min(times * 200, 2000),
  });

  // Without an error listener, ioredis throws on the process — which we must
  // never let happen for an optional dependency. Log sparingly instead.
  let loggedError = false;
  c.on("error", (err) => {
    if (!loggedError) {
      loggedError = true;
      console.error("Redis unavailable, falling back:", err.message);
    }
  });
  c.on("ready", () => {
    loggedError = false;
  });

  client = c;
  globalForRedis.__redis = c;
  return c;
}

/** True when a Redis URL is configured (the client may still be reconnecting). */
export function redisEnabled(): boolean {
  return getRedis() !== null;
}

/** GET a string value; returns null when Redis is disabled or errors. */
export async function redisGet(key: string): Promise<string | null> {
  const r = getRedis();
  if (!r) return null;
  try {
    return await r.get(key);
  } catch {
    return null;
  }
}

/** SET a string value with a TTL (seconds); silently no-ops on disable/error. */
export async function redisSet(key: string, value: string, ttlSeconds: number): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    await r.set(key, value, "EX", ttlSeconds);
  } catch {
    // Best-effort cache write; ignore failures.
  }
}

/** DELETE a key; silently no-ops on disable/error. */
export async function redisDel(key: string): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    await r.del(key);
  } catch {
    // Best-effort; ignore.
  }
}

/**
 * Atomically increments `key` and ensures it expires after `ttlSeconds`,
 * returning the new count. Returns null when Redis is disabled or errors, so
 * callers can fall back to another limiter. Used by the rate limiter.
 */
export async function redisIncrWithTtl(key: string, ttlSeconds: number): Promise<number | null> {
  const r = getRedis();
  if (!r) return null;
  try {
    const results = await r.multi().incr(key).expire(key, ttlSeconds).exec();
    const count = results?.[0]?.[1];
    return typeof count === "number" ? count : null;
  } catch {
    return null;
  }
}
