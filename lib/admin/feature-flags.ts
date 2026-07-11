import { eq } from "drizzle-orm";
import { db } from "@/lib/infra/db";
import { featureFlags } from "@/lib/infra/db/schema";

/**
 * Reads runtime-tunable settings from the `feature_flags` table, falling back
 * to the caller-supplied default when no row exists — so behavior is
 * unchanged until an admin actually sets a flag. Short-TTL cached (mirrors
 * lib/ai/prompt-registry.ts's getPrompt) so hot paths (AI provider select,
 * rate-limit checks) don't hit the DB on every call.
 */

const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { value: string | null; expiresAt: number }>();

async function readFlag(key: string): Promise<string | null> {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const [row] = await db.select().from(featureFlags).where(eq(featureFlags.key, key)).limit(1);
  const value = row?.value ?? null;
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

/** Reads a string-valued flag (stored as a JSON string), or `fallback` if unset/invalid. */
export async function getFlagString(key: string, fallback: string): Promise<string> {
  const raw = await readFlag(key);
  if (raw === null) return fallback;
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "string" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

/** Reads a number-valued flag (stored as JSON), or `fallback` if unset/invalid/non-positive. */
export async function getFlagNumber(key: string, fallback: number): Promise<number> {
  const raw = await readFlag(key);
  if (raw === null) return fallback;
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "number" && Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  } catch {
    return fallback;
  }
}

/** Reads a boolean-valued flag (stored as JSON), or `fallback` if unset/invalid. */
export async function getFlagBoolean(key: string, fallback: boolean): Promise<boolean> {
  const raw = await readFlag(key);
  if (raw === null) return fallback;
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "boolean" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

/** Drops the cached lookup for `key`, or all keys if omitted — call after writing a flag. */
export function invalidateFlagCache(key?: string): void {
  if (key) cache.delete(key);
  else cache.clear();
}
