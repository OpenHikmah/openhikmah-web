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

type FlagType = "string" | "number" | "boolean";

// The subset of flag keys the app actually reads via getFlagString/Number/Boolean
// (see the "Operational settings" panel in the admin UI). Everything else goes
// through the generic key/JSON-value editor and has no fixed shape by design, so
// it's intentionally left unvalidated here.
const KNOWN_FLAG_TYPES: Record<string, FlagType> = {
  ai_provider: "string",
  maintenance_mode: "boolean",
  ai_gen_limit: "number",
  ai_gen_window_seconds: "number",
  mutation_limit: "number",
  mutation_window_seconds: "number",
};

/** Exported so the admin UI can warn before deleting a key with real runtime effect. */
export const KNOWN_OPERATIONAL_FLAG_KEYS: ReadonlySet<string> = new Set(
  Object.keys(KNOWN_FLAG_TYPES)
);

/**
 * Checks `value`'s JS type against a known flag key's expected type. Returns
 * an error message on mismatch, or null when the key is unknown (unrestricted)
 * or the type matches. Without this, a mistyped value (e.g. a string for
 * `ai_gen_limit`) saves successfully but is silently ignored by
 * `getFlagNumber`'s fallback the next time it's read — a confusing "my change
 * didn't do anything" instead of an error at write time.
 */
export function validateFlagType(key: string, value: unknown): string | null {
  const expected = KNOWN_FLAG_TYPES[key];
  if (!expected) return null;
  if (expected === "number") {
    return typeof value === "number" && Number.isFinite(value) ? null : `"${key}" must be a number`;
  }
  return typeof value === expected ? null : `"${key}" must be a ${expected}`;
}
