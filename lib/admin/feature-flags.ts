import { eq } from "drizzle-orm";
import { db } from "@/lib/infra/db";
import { featureFlags } from "@/lib/infra/db/schema";
import { incr } from "@/lib/infra/metrics";

/**
 * Reads runtime-tunable settings from the `feature_flags` table, falling back
 * to the caller-supplied default when no row exists — so behavior is
 * unchanged until an admin actually sets a flag. Short-TTL cached (mirrors
 * lib/ai/prompt-registry.ts's getPrompt) so hot paths (AI provider select,
 * rate-limit checks) don't hit the DB on every call.
 */

const CACHE_TTL_MS = 30_000;
// `undefined` = no row, or a row whose value isn't valid JSON (JSON.parse never
// yields undefined, so it can't collide with a real stored value).
const cache = new Map<string, { value: unknown; expiresAt: number }>();

async function readFlag(key: string): Promise<unknown> {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const [row] = await db.select().from(featureFlags).where(eq(featureFlags.key, key)).limit(1);
  let value: unknown;
  if (row) {
    try {
      value = JSON.parse(row.value);
    } catch (err) {
      // Parsed once per cache fill, so this logs at most once per TTL per key
      // instead of on every hot-path read.
      console.error(`Feature flag "${key}" has a corrupt stored value, using fallback:`, err);
      incr("feature_flag_corrupt");
    }
  }
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

/** Reads a string-valued flag (stored as a JSON string), or `fallback` if unset/invalid. */
export async function getFlagString(key: string, fallback: string): Promise<string> {
  const value = await readFlag(key);
  return typeof value === "string" ? value : fallback;
}

/** Reads a number-valued flag (stored as JSON), or `fallback` if unset/invalid/non-positive. */
export async function getFlagNumber(key: string, fallback: number): Promise<number> {
  const value = await readFlag(key);
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

/** Reads a boolean-valued flag (stored as JSON), or `fallback` if unset/invalid. */
export async function getFlagBoolean(key: string, fallback: boolean): Promise<boolean> {
  const value = await readFlag(key);
  return typeof value === "boolean" ? value : fallback;
}

/** Drops the cached lookup for `key`, or all keys if omitted — call after writing a flag. */
export function invalidateFlagCache(key?: string): void {
  if (key) cache.delete(key);
  else cache.clear();
}

// Re-exported for callers that previously imported these from this module.
// They live in ./feature-flag-keys (no `db` import) so client components can
// import them without pulling the server-only postgres client into the bundle.
export { validateFlagType } from "./feature-flag-keys";
