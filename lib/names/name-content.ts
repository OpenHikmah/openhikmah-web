import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/infra/db";
import { nameContent, nameVerseReasons, type NameContentKind } from "@/lib/infra/db/schema";
import { resolveModel, resolveProvider, type Provider } from "@/lib/ai/ai";
import { incr } from "@/lib/infra/metrics";
import type { Locale } from "@/lib/i18n/config";

/** The provider+model to use for (and attribute) one names generation. */
export interface ResolvedNamesModel {
  provider: Provider;
  model: string;
}

/**
 * Passed into every `generate` callback alongside the resolved provider+model.
 * `markRefusal()` is the callback's way of telling `resolveAndGenerate` that an
 * empty/degraded result came from a *detected refusal* (see lib/ai/refusal.ts)
 * rather than a generic empty response, a parse failure, or a transient search
 * miss. See `resolveAndGenerate`'s doc comment for why that distinction gates
 * the Gemini fallback.
 */
export interface GenerationContext extends ResolvedNamesModel {
  markRefusal: () => void;
}

// Resolved ONCE per generation and passed as a pinned pair into both the
// `callAI` request (as provider + model overrides) and the persisted `model`
// column, so a config change (`ai_provider_names` / `ai_model_names`) mid-flight
// can't make the request use one provider while the recorded model belongs to
// another — or make the stored attribution disagree with what actually ran.
const resolveNamesModel = async (): Promise<ResolvedNamesModel> => {
  const provider = await resolveProvider("names");
  const model = await resolveModel("names", provider);
  return { provider, model };
};

/**
 * Resolves the primary provider+model, generates once, and — only when the
 * primary is Claude and either the result comes back empty (the shape a
 * route's own caught AI failure already takes, see reflection/pairings/verses
 * routes) OR the call throws — retries once against Gemini, whose API key is
 * already provisioned in every deployment (see .env.example) and whose free
 * tier easily absorbs an occasional retry. One-directional (Claude -> Gemini
 * only): a deployment already pointed at Gemini for "names" has nothing to
 * fall back to, so a throw there re-raises immediately.
 *
 * Every current `generate` callback already catches its own `callAI` failure
 * and returns an empty result rather than throwing, so a throw reaching here
 * today is never itself a provider error — it's something upstream of the AI
 * call (e.g. a verse-search/fetch failure in the "verses" generator). Gemini
 * can't fix that, so the retry there just re-runs the whole callback once
 * more before re-raising the same error. That's accepted as the cost of one
 * uniform contract: any future `generate` that lets a genuine provider error
 * propagate gets the retry it needs, without every callback having to opt in.
 *
 * A throw and an empty result are treated the same for *retry* purposes, but
 * differ in what happens when the retry ALSO fails: an empty primary result
 * degrades to that (still-valid, just uncached) empty result, same as before
 * this retry existed. A primary *throw* means there is no valid result to
 * degrade to, so the fallback's failure re-raises the original primary error
 * — never silently downgrading a real failure into a fabricated empty success.
 *
 * EXCEPT for a detected refusal (`ctx.markRefusal()` — see `GenerationContext`):
 * an empty result from a refusal is NOT retried against Gemini. A refusal on
 * borderline theological phrasing is Claude declining to answer; silently
 * answering it with a different provider instead would defeat the point of
 * the refusal, and previously this path was indistinguishable from any other
 * empty result. A refusal still degrades to the same empty/uncached result a
 * non-refusal empty result would, it just skips the fallback attempt — logged
 * distinctly (`names_ai_refusal_no_fallback`) from the ordinary fallback path
 * (`names_ai_fallback_used`) so the two are visible separately on /api/metrics.
 *
 * `logLabel` identifies the (slug, kind[, ref]) this call is generating, for
 * the log lines above — every call site already has this in scope.
 *
 * Returns whichever (result, model) pair actually produced the value, so the
 * persisted `model` column never disagrees with what actually ran.
 */
async function resolveAndGenerate<T>(
  logLabel: string,
  generate: (ctx: GenerationContext) => Promise<T>,
  isEmpty: (value: T) => boolean
): Promise<{ result: T; model: string }> {
  const resolved = await resolveNamesModel();

  let refused = false;
  const primaryCtx: GenerationContext = {
    ...resolved,
    markRefusal: () => {
      refused = true;
    },
  };

  let result: T | undefined;
  let threw = false;
  let primaryError: unknown;
  try {
    result = await generate(primaryCtx);
  } catch (err) {
    threw = true;
    primaryError = err;
    // Logged here (not just on a subsequent fallback failure) so a systematic
    // primary failure that Gemini happens to paper over still surfaces —
    // otherwise it would produce no log line at all.
    console.error(`Names: primary (${resolved.provider}) generation failed for ${logLabel}:`, err);
    incr("names_primary_generation_failed");
  }

  if (refused) {
    console.error(
      `Names: ${resolved.provider} refused for ${logLabel}, not falling back to Gemini`
    );
    incr("names_ai_refusal_no_fallback");
    return { result: result as T, model: resolved.model };
  }

  const shouldRetry = resolved.provider === "claude" && (threw || isEmpty(result as T));
  if (!shouldRetry) {
    if (threw) throw primaryError;
    return { result: result as T, model: resolved.model };
  }

  if (!threw) {
    // The throw case already logged above at catch time — this covers the
    // "returned empty without throwing" path, which previously had no log
    // line at all (only the incr("names_ai_fallback_used") below, and only
    // when the fallback itself succeeds).
    console.error(
      `Names: primary (${resolved.provider}) returned empty for ${logLabel}, falling back to Gemini`
    );
  }

  try {
    const fallbackModel = await resolveModel("names", "gemini");
    const fallbackResult = await generate({
      provider: "gemini",
      model: fallbackModel,
      markRefusal: () => undefined,
    });
    if (!isEmpty(fallbackResult)) incr("names_ai_fallback_used");
    return { result: fallbackResult, model: fallbackModel };
  } catch (err) {
    console.error(`Names: Gemini fallback failed for ${logLabel}:`, err);
    // The primary threw: there's no valid result to degrade to, so the
    // original failure must surface — swallowing it here would turn a real
    // AI failure into a fabricated empty success.
    if (threw) throw primaryError;
    // The primary just returned empty: degrade to that (still-valid, just
    // uncached) result, same as before this retry existed — never let a
    // fallback-attempt failure surface as an unhandled rejection callers
    // didn't have to handle before.
    return { result: result as T, model: resolved.model };
  }
}

/**
 * Durable, write-once/read-many cache for the AI-generated 99-Names content
 * (verses, reflection, pairings). Replaces Next's `unstable_cache`, which is
 * wiped on every redeploy and so re-runs Claude for each name after each deploy.
 * Persisting to Postgres means each (slug, kind, locale) is generated at most
 * once per prompt `version` and served from the DB forever — the same pattern
 * the connection graph uses (see lib/graph-service.ts).
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
  generate: (ctx: GenerationContext) => Promise<T>,
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

/**
 * Read-only cache lookup for `(slug, kind, locale)` at the current `version` —
 * never generates, never consumes rate limit. Used for server-side prefetch
 * (e.g. SSR) where a cache miss should fall through to the existing
 * client-fetch-and-generate path rather than block the page render on an AI call.
 */
export async function getCachedNameContent<T>(
  slug: string,
  kind: NameContentKind,
  locale: Locale,
  version: number
): Promise<T | null> {
  let row: { data: string; version: number } | undefined;
  try {
    [row] = await db
      .select({ data: nameContent.data, version: nameContent.version })
      .from(nameContent)
      .where(
        and(eq(nameContent.slug, slug), eq(nameContent.kind, kind), eq(nameContent.locale, locale))
      )
      .limit(1);
  } catch (err) {
    // This is a read-only SSR prefetch (see call site in page.tsx) — a DB
    // hiccup here must fall through to the client-side fetch-and-generate
    // path, not crash the whole page render.
    console.error(`Failed to read name_content for ${slug}/${kind}/${locale}:`, err);
    return null;
  }

  if (!row || row.version !== version) return null;
  try {
    return JSON.parse(row.data) as T;
  } catch (err) {
    console.error(`Corrupt name_content row for ${slug}/${kind}/${locale}:`, err);
    return null;
  }
}

/**
 * Read-only, read-many cache lookup across `slugs` for one `(kind, locale)` at
 * the current `version` — one query instead of one per slug. Used by the
 * /names grid, which needs a translated `meaning` for up to all 99 names on a
 * single render and must never trigger 99 AI generations to do it (a miss is
 * just absent from the returned map; callers fall back to the canonical
 * English string, same as `getCachedNameContent`'s single-slug contract).
 */
export async function getCachedNameContentBulk<T>(
  slugs: string[],
  kind: NameContentKind,
  locale: Locale,
  version: number
): Promise<Map<string, T>> {
  const out = new Map<string, T>();
  if (slugs.length === 0) return out;

  let rows: Array<{ slug: string; data: string; version: number }>;
  try {
    rows = await db
      .select({ slug: nameContent.slug, data: nameContent.data, version: nameContent.version })
      .from(nameContent)
      .where(
        and(
          inArray(nameContent.slug, slugs),
          eq(nameContent.kind, kind),
          eq(nameContent.locale, locale)
        )
      );
  } catch (err) {
    console.error(`Failed to bulk-read name_content for ${kind}/${locale}:`, err);
    return out;
  }

  for (const row of rows) {
    if (row.version !== version) continue;
    try {
      out.set(row.slug, JSON.parse(row.data) as T);
    } catch (err) {
      console.error(`Corrupt name_content row for ${row.slug}/${kind}/${locale}:`, err);
    }
  }
  return out;
}

async function generateAndPersist<T>(
  slug: string,
  kind: NameContentKind,
  locale: Locale,
  version: number,
  generate: (ctx: GenerationContext) => Promise<T>,
  isEmpty: (value: T) => boolean
): Promise<T> {
  const { result, model } = await resolveAndGenerate(`${slug}/${kind}`, generate, isEmpty);

  if (!isEmpty(result)) {
    const data = JSON.stringify(result);
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
  generate: (ctx: GenerationContext) => Promise<string>,
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
    const { result: reason, model } = await resolveAndGenerate(
      `${slug}/verse-reason/${ref}`,
      generate,
      (r) => r.trim() === ""
    );
    if (reason.trim() === "") return reason;

    try {
      // `reasonInFlight` only coalesces callers within this process — a
      // concurrent request on another instance can win the same (slug, ref,
      // locale) row first. RETURNING is empty exactly when DO NOTHING
      // discarded our insert; re-read in that case so this call returns the
      // translation that's actually persisted, not the one that lost.
      const inserted = await db
        .insert(nameVerseReasons)
        .values({ slug, ref, locale, reason, model })
        .onConflictDoNothing()
        .returning({ reason: nameVerseReasons.reason });
      if (inserted.length === 0) {
        const [existing] = await db
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
        if (existing) return existing.reason;
      }
    } catch (err) {
      console.error("Failed to persist name_verse_reasons:", err);
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
