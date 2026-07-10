import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/infra/db";
import { promptVersions } from "@/lib/infra/db/schema";

/** The prompt slots a version can target — see connection-generator.ts. */
export const PROMPT_KEYS = ["connection.legacy", "connection.selection"] as const;
export type PromptKey = (typeof PROMPT_KEYS)[number];

interface ResolvedPrompt {
  template: string;
  /** The `prompt_versions.id` that produced this template, or null if the
   *  hardcoded fallback was used (no active DB version for this key). */
  version: number | null;
}

const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { value: ResolvedPrompt; expiresAt: number }>();

/**
 * Resolves the active DB-stored template for `key`, falling back to the
 * caller-supplied hardcoded template when no active version exists — so
 * prompt behavior is unchanged until an admin actually creates a version.
 * Short-TTL cached (mirrors the admin-allowlist memoization in
 * lib/admin/admin-auth.ts) so a hot generation path doesn't hit the DB on
 * every call.
 */
export async function getPrompt(key: PromptKey, fallback: string): Promise<ResolvedPrompt> {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const [row] = await db
    .select()
    .from(promptVersions)
    .where(and(eq(promptVersions.key, key), eq(promptVersions.active, true)))
    .orderBy(desc(promptVersions.createdAt))
    .limit(1);

  const value: ResolvedPrompt = row
    ? { template: row.template, version: row.id }
    : { template: fallback, version: null };

  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

/** Fills `{{name}}` placeholders in a template from `vars`. Unknown placeholders render empty. */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => vars[name] ?? "");
}

/** Drops the cached lookup for `key`, or all keys if omitted — call after writing a new version. */
export function invalidatePromptCache(key?: PromptKey): void {
  if (key) cache.delete(key);
  else cache.clear();
}
