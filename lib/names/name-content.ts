import { and, eq } from "drizzle-orm";
import { db } from "@/lib/infra/db";
import { nameContent, nameVerseReasons, type NameContentKind } from "@/lib/infra/db/schema";
import type { Locale } from "@/lib/i18n/config";

/**
 * Durable, write-once/read-many cache for the AI-generated 99-Names content
 * (verses, reflection, pairings). Replaces Next's `unstable_cache`, which is
 * wiped on every redeploy and so re-runs Claude for each name after each deploy.
 * Persisting to Postgres means each (name, kind) is generated at most once per
 * prompt `version` and served from the DB forever — the same pattern the
 * connection graph uses (see lib/graph-service.ts).
 */

export type { NameContentKind };

// Per-process single-flight: concurrent first-loads of the same (slug, kind,
// version) share one generation instead of each calling the AI (mirrors
// graph-service). The value is `Promise<unknown>` because the map is shared
// across kinds; each key is only ever produced by one call site with one `T`,
// so the `as Promise<T>` read below is sound (see getOrGenerateNameContent).
const inFlight = new Map<string, Promise<unknown>>();

/**
 * Returns the cached content for `(slug, kind, locale)` when present at the
 * current `version`; otherwise runs `generate()`, persists the result (unless
 * empty), and returns it.
 *
 * `isEmpty` decides whether a result is worth caching — an empty array or blank
 * string usually means a transient search/AI failure, so we return it but do NOT
 * persist, leaving the next request free to retry (mirrors how the connection
 * graph only stores non-empty generations). Bumping `version` for a kind forces
 * regeneration after a prompt change.
 *
 * `onBeforeGenerate` runs only on a durable-cache miss, before joining or
 * starting a generation — the seam where routes enforce their per-client
 * rate limit (cache hits stay unlimited, matching the limiter's contract in
 * lib/infra/rate-limit.ts). A throw here (RateLimitError) propagates to the
 * caller and nothing is generated or cached.
 */
export async function getOrGenerateNameContent<T>(
  slug: string,
  kind: NameContentKind,
  locale: Locale,
  version: number,
  generate: () => Promise<T>,
  isEmpty: (value: T) => boolean,
  onBeforeGenerate?: () => Promise<void>
): Promise<T> {
  // 1. Durable cache hit (only when the stored version matches the current one).
  const [row] = await db
    .select({ data: nameContent.data, version: nameContent.version })
    .from(nameContent)
    .where(
      and(eq(nameContent.slug, slug), eq(nameContent.kind, kind), eq(nameContent.locale, locale))
    )
    .limit(1);

  if (row && row.version === version) {
    try {
      return JSON.parse(row.data) as T;
    } catch (err) {
      // Corrupt cache row — log (it's a genuine anomaly that would otherwise
      // silently re-trigger AI generation every request) then regenerate, which
      // overwrites it via the upsert below.
      console.error(`Corrupt name_content row for ${slug}/${kind}/${locale}, regenerating:`, err);
    }
  }

  if (onBeforeGenerate) await onBeforeGenerate();

  // 2. Single-flight: the get→set stays synchronous so two concurrent callers
  // can't both become the leader. `version` is part of the key so a follower can
  // never join a generation running under a different version (defensive — the
  // version is a per-route constant, so this only differs across a deploy).
  const key = `${slug}:${kind}:${locale}:${version}`;
  const pending = inFlight.get(key);
  if (pending) return pending as Promise<T>;

  const work = generateAndPersist(slug, kind, locale, version, generate, isEmpty);
  inFlight.set(key, work);
  try {
    return await work;
  } finally {
    inFlight.delete(key);
  }
}

async function generateAndPersist<T>(
  slug: string,
  kind: NameContentKind,
  locale: Locale,
  version: number,
  generate: () => Promise<T>,
  isEmpty: (value: T) => boolean
): Promise<T> {
  const result = await generate();

  if (!isEmpty(result)) {
    const data = JSON.stringify(result);
    const model = process.env.ANTHROPIC_MODEL ?? null;
    try {
      await db
        .insert(nameContent)
        .values({ slug, kind, locale, data, model, version })
        .onConflictDoUpdate({
          target: [nameContent.slug, nameContent.kind, nameContent.locale],
          set: { data, model, version, updatedAt: new Date() },
        });
    } catch (err) {
      // Best-effort cache write — never fail the request because caching failed.
      console.error("Failed to persist name_content:", err);
    }
  }

  return result;
}

// Per-process single-flight for verse-reason translations, mirroring `inFlight`
// above but keyed into name_verse_reasons instead of name_content.
const reasonInFlight = new Map<string, Promise<string>>();

/**
 * Returns a locale-specific translation of a "verses" entry's per-verse
 * `reason`, generating and persisting it on first request for that
 * `(slug, ref, locale)`. Verse *selection* is never re-run here — callers
 * pass the already-resolved canonical reason into `generate` to translate,
 * not to re-derive from scratch (see lib/infra/db/schema.ts's comment on
 * name_verse_reasons for why).
 */
export async function getOrGenerateVerseReason(
  slug: string,
  ref: string,
  locale: Locale,
  generate: () => Promise<string>,
  onBeforeGenerate?: () => Promise<void>
): Promise<string> {
  const [row] = await db
    .select({ reason: nameVerseReasons.reason })
    .from(nameVerseReasons)
    .where(
      and(
        eq(nameVerseReasons.slug, slug),
        eq(nameVerseReasons.ref, ref),
        eq(nameVerseReasons.locale, locale)
      )
    )
    .limit(1);

  if (row) return row.reason;

  if (onBeforeGenerate) await onBeforeGenerate();

  const key = `${slug}:${ref}:${locale}`;
  const pending = reasonInFlight.get(key);
  if (pending) return pending;

  const work = (async () => {
    const reason = await generate();
    if (reason.trim() !== "") {
      const model = process.env.ANTHROPIC_MODEL ?? null;
      try {
        await db
          .insert(nameVerseReasons)
          .values({ slug, ref, locale, reason, model })
          .onConflictDoNothing();
      } catch (err) {
        console.error("Failed to persist name_verse_reasons:", err);
      }
    }
    return reason;
  })();
  reasonInFlight.set(key, work);
  try {
    return await work;
  } finally {
    reasonInFlight.delete(key);
  }
}
