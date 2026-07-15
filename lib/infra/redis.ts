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

/** Publishes `message` on `channel`; silently no-ops on disable/error. Used for
 *  cross-instance cache invalidation (e.g. auth cache flushes). */
export function redisPublish(channel: string, message: string): void {
  const r = getRedis();
  if (!r) return;
  void r.publish(channel, message).catch(() => {});
}

// Subscribing puts an ioredis connection into subscriber mode, where it can no
// longer run normal commands — so this must be a dedicated duplicate client,
// never the shared one from getRedis(). Reused across hot-reloads the same way
// as the primary client.
let subscriberClient: Redis | null | undefined;
const globalForRedisSub = globalThis as unknown as { __redisSub?: Redis | null };

/** Subscribes `onMessage` to `channel`; no-ops when Redis is disabled. Safe to
 *  call multiple times for different channels — they share one subscriber
 *  connection. Best-effort: a missed message just means a cache stays stale
 *  until its normal TTL expiry, never a correctness failure. */
export function redisSubscribe(channel: string, onMessage: (message: string) => void): void {
  const base = getRedis();
  if (!base) return;

  if (subscriberClient === undefined) {
    if (globalForRedisSub.__redisSub !== undefined) {
      subscriberClient = globalForRedisSub.__redisSub;
    } else {
      const sub = base.duplicate();
      sub.on("error", () => {
        // Best-effort; the primary client's error listener already logs once.
      });
      subscriberClient = sub;
      globalForRedisSub.__redisSub = sub;
    }
  }
  if (!subscriberClient) return;

  subscriberClient.subscribe(channel).catch(() => {});
  subscriberClient.on("message", (ch: string, message: string) => {
    if (ch === channel) onMessage(message);
  });
}

/** Health-check the Redis connection. Returns "disabled" when Redis is
 *  unconfigured or unreachable, "up" when PONG responds, or "down" on error. */
export async function redisStatus(): Promise<"disabled" | "up" | "down"> {
  if (!redisEnabled()) return "disabled";
  try {
    const client = getRedis();
    if (!client) return "disabled";
    const pong = await client.ping();
    return pong === "PONG" ? "up" : "down";
  } catch {
    return "down";
  }
}

/**
 * Atomically increments `key` and ensures it expires after `ttlSeconds`,
 * returning the new count. Returns null when Redis is disabled or errors, so
 * callers can fall back to another limiter. Used by the rate limiter.
 *
 * Re-applying EXPIRE on every increment is intentional and benign: callers embed
 * a time-window bucket in the key (see lib/rate-limit.ts), so each window gets a
 * fresh key and the count resets at the window boundary regardless — the repeated
 * EXPIRE only keeps the current bucket's self-cleanup TTL fresh, it does not slide
 * the rate-limit window.
 */
export async function redisIncrWithTtl(key: string, ttlSeconds: number): Promise<number | null> {
  const r = getRedis();
  if (!r) return null;
  try {
    const results = await r.multi().incr(key).expire(key, ttlSeconds).exec();
    // exec() resolves even on per-command failure: results is [[err, value], ...].
    // Only trust the count when the INCR itself succeeded — otherwise fall back to
    // the Postgres limiter. (An EXPIRE-only failure still yields a correct count;
    // the limit decision is unaffected, and the next increment re-applies the TTL.)
    const incrErr = results?.[0]?.[0];
    const count = results?.[0]?.[1];
    if (incrErr != null || typeof count !== "number") return null;
    return count;
  } catch {
    return null;
  }
}
