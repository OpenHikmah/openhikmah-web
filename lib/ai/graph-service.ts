import { and, eq, inArray, notInArray } from "drizzle-orm";
import { db } from "@/lib/infra/db";
import { connections, type Connection } from "@/lib/infra/db/schema";
import { generateConnections, generateGroundedConnections } from "@/lib/ai/connection-generator";
import { resolveModel, resolveProvider, type Provider } from "@/lib/ai/ai";
import { translateReason } from "@/lib/ai/translate";
import { discoverCandidates } from "@/lib/ai/connection-discovery";
import { resolveVerse } from "@/lib/quran/verse-resolver";
import { consume, RateLimitError } from "@/lib/infra/rate-limit";
import { incr } from "@/lib/infra/metrics";
import { LOCALE_LANGUAGE_NAME, type Locale } from "@/lib/i18n/config";
import type { ConnectionResult, EdgeKind } from "@/types/quran";

/**
 * The persistent knowledge graph. Reads connections from Postgres; only on a
 * miss does it call the AI, then writes the result back so every later reader
 * gets it for free. This is what makes AI cost trend toward zero.
 *
 * English is canonical. A non-`en` cache miss does NOT re-derive the verse
 * SELECTION in that language — it ensures the `en` rows exist, then translates
 * their reasons for the requested locale (mirrors lib/ai/connection-batch.ts, so
 * live traffic and the admin backfill converge on the same rows instead of
 * layering mixed-provenance ones).
 */

/**
 * Single-flight registry: concurrent cache misses for the SAME verse+kind+locale
 * share one in-flight generation instead of each firing its own (expensive) AI
 * call. Per-process — full coverage on the single box; a multi-instance deployment
 * would need a Redis lock to coalesce across processes (deferred). Keyed by
 * `${fromRef}:${kind}:${locale}:${provider}:${model}:${excludeRefs}`; entries are
 * removed as soon as the generation settles. A non-`en` miss also joins the `en`
 * key while it ensures the canonical rows.
 */
const inFlight = new Map<string, Promise<CellGenerationResult>>();

/** Result of one miss-path generation. `calledAI` is false only when the
 *  grounded candidate pool was already exhausted for a "get more" request, so
 *  no LLM call was made — the admin backfill job uses this to mark a cell
 *  exhausted and never re-pay for it. */
export interface CellGenerationResult {
  results: ConnectionResult[];
  calledAI: boolean;
}

interface SourceVerse {
  arabicText: string;
  translation: string;
}

interface GetConnectionsOptions {
  /** Identifier (e.g. client IP) used to rate-limit the AI generation path.
   *  When set and the client is over budget, a miss throws RateLimitError.
   *  Cache hits are never rate-limited. */
  clientKey?: string;
  /** Refs already shown to the caller for this fromRef+kind — excluded from
   *  both the cache read and any fresh generation, so a repeat "get more"
   *  request surfaces genuinely new connections instead of the same set. */
  excludeRefs?: string[];
  /** Language the reason text is served in. The verse selection is always the
   *  canonical `en` one; a non-`en` value translates each `en` reason and caches
   *  the result under that locale. Defaults to "en". */
  locale?: Locale;
  /** Forces a specific LLM provider for the miss-path generation (the admin
   *  batch job's per-run pick). Unset for live traffic, which uses the
   *  feature/global provider flags. */
  provider?: Provider;
  /** Forces a specific model for the miss-path generation (applied only when it
   *  belongs to the resolved provider). Batch job's per-run pick. */
  model?: string;
}

function cellKey(
  fromRef: string,
  kind: EdgeKind,
  locale: Locale,
  provider: Provider,
  model: string,
  excludeRefs: string[]
): string {
  return `${fromRef}:${kind}:${locale}:${provider}:${model}:${[...excludeRefs].sort().join(",")}`;
}

/** Join an in-flight identical generation if one is running, otherwise lead it.
 *  The get→set MUST stay synchronous (no await between them) or two concurrent
 *  callers could both become the leader. */
async function singleFlight(
  key: string,
  factory: () => Promise<CellGenerationResult>
): Promise<CellGenerationResult> {
  const pending = inFlight.get(key);
  if (pending) {
    incr("gen_coalesced");
    return pending;
  }
  incr("gen_started");
  const work = factory();
  inFlight.set(key, work);
  try {
    return await work;
  } finally {
    inFlight.delete(key);
  }
}

/** Hydrate stored edges (which carry only refs + reason) into full results. */
async function hydrate(rows: Connection[], kind: EdgeKind): Promise<ConnectionResult[]> {
  const resolved = await Promise.all(rows.map((r) => resolveVerse(r.toRef)));
  return rows
    .map((r, i) => {
      const verse = resolved[i];
      if (!verse) return null;
      const result: ConnectionResult = {
        surah: verse.surah,
        ayah: verse.ayah,
        ref: verse.ref,
        arabicText: verse.arabicText,
        translation: verse.translation,
        surahName: verse.surahName,
        surahNameArabic: verse.surahNameArabic,
        reason: r.reason,
        kind,
      };
      return result;
    })
    .filter((c): c is ConnectionResult => c !== null);
}

/** Read the active cached edges for one cell+locale, hydrated. */
async function readActiveConnections(
  fromRef: string,
  kind: EdgeKind,
  locale: Locale,
  excludeRefs: string[]
): Promise<ConnectionResult[]> {
  const rows = await db
    .select()
    .from(connections)
    .where(
      and(
        eq(connections.fromRef, fromRef),
        eq(connections.kind, kind),
        eq(connections.status, "active"),
        eq(connections.locale, locale),
        ...(excludeRefs.length > 0 ? [notInArray(connections.toRef, excludeRefs)] : [])
      )
    )
    // A single generation inserts ~12 edges (see discoverCandidates), but this
    // has no upper bound enforced at write time — cap defensively so a future
    // code path that inserts more edges per source ref can't turn this into an
    // unbounded per-key list query, the same shape hardened elsewhere.
    .limit(200);
  return hydrate(rows, kind);
}

/**
 * Returns connections for a source verse and kind. Served from the DB graph when
 * present; otherwise generated, persisted, and returned. `source` text is only
 * needed for the miss path (it grounds the AI prompt).
 */
export async function getConnections(
  fromRef: string,
  kind: EdgeKind,
  source: SourceVerse,
  options: GetConnectionsOptions = {}
): Promise<ConnectionResult[]> {
  const excludeRefs = options.excludeRefs ?? [];
  const locale = options.locale ?? "en";

  const existing = await readActiveConnections(fromRef, kind, locale, excludeRefs);
  if (existing.length > 0) return existing;

  // Cache miss — this is the expensive path, so rate-limit it (per client, as
  // before: the limiter runs for every caller, so the budget semantics are
  // unchanged — only the AI call itself is de-duplicated below).
  if (options.clientKey) {
    const allowed = await consume(`gen:${options.clientKey}`);
    if (!allowed) throw new RateLimitError();
  }

  // Resolve the effective provider+model ONCE for this miss (honouring any
  // batch-job override), then thread the same concrete pair through the
  // single-flight key, the generation call, and the persisted attribution — so
  // an admin flipping `ai_provider_connections` / `ai_model_connections`
  // between those steps can't make the request use one provider while the row
  // records a model from another.
  const provider = await resolveProvider("connections", options.provider);
  const model = await resolveModel("connections", provider, options.model);

  const key = cellKey(fromRef, kind, locale, provider, model, excludeRefs);
  const result = await singleFlight(key, () =>
    locale === "en"
      ? generateConnectionsForCell(fromRef, kind, source, excludeRefs, provider, model)
      : generateLocalizedCell(fromRef, kind, source, excludeRefs, locale, provider, model)
  );
  return result.results;
}

/**
 * Non-`en` miss body: ensure the canonical English rows exist (generating them
 * through the same single-flight if not), then translate each English reason
 * into `locale` and cache the translated rows under that locale. A reason whose
 * translation fails is served in English for this response and left unpersisted
 * so a later request or the backfill retries it.
 */
async function generateLocalizedCell(
  fromRef: string,
  kind: EdgeKind,
  source: SourceVerse,
  excludeRefs: string[],
  locale: Locale,
  provider: Provider,
  model: string
): Promise<CellGenerationResult> {
  let enResults = await readActiveConnections(fromRef, kind, "en", excludeRefs);
  let calledAI = false;
  if (enResults.length === 0) {
    const enKey = cellKey(fromRef, kind, "en", provider, model, excludeRefs);
    const gen = await singleFlight(enKey, () =>
      generateConnectionsForCell(fromRef, kind, source, excludeRefs, provider, model)
    );
    enResults = gen.results;
    calledAI = gen.calledAI;
  }
  if (enResults.length === 0) return { results: [], calledAI };

  const toPersist: { toRef: string; reason: string }[] = [];
  const localized: ConnectionResult[] = [];
  for (const en of enResults) {
    const translated = await translateReason(en.reason, LOCALE_LANGUAGE_NAME[locale], {
      provider,
      model,
    });
    calledAI = true;
    if (translated === "") {
      incr("connections_live_translate_failed");
      localized.push(en);
      continue;
    }
    toPersist.push({ toRef: en.ref, reason: translated });
    localized.push({ ...en, reason: translated });
  }

  if (toPersist.length > 0) {
    const persisted = await persistTranslatedRows(fromRef, kind, locale, model, toPersist);
    for (const row of localized) {
      const stored = persisted.get(row.ref);
      if (stored !== undefined && stored !== row.reason) row.reason = stored;
    }
  }
  return { results: localized, calledAI };
}

/** Insert translated rows; a concurrent writer (another instance, or the batch)
 *  can win the same (fromRef, toRef, kind, locale) row first, so re-read the
 *  ones DO NOTHING discarded and return what is actually persisted. */
async function persistTranslatedRows(
  fromRef: string,
  kind: EdgeKind,
  locale: Locale,
  model: string,
  rows: { toRef: string; reason: string }[]
): Promise<Map<string, string>> {
  try {
    const inserted = await db
      .insert(connections)
      .values(rows.map((r) => ({ fromRef, toRef: r.toRef, kind, reason: r.reason, model, locale })))
      .onConflictDoNothing()
      .returning({ toRef: connections.toRef });

    const insertedRefs = new Set(inserted.map((r) => r.toRef));
    const conflicted = rows.filter((r) => !insertedRefs.has(r.toRef));
    if (conflicted.length === 0) return new Map();

    const stored = await db
      .select({ toRef: connections.toRef, reason: connections.reason })
      .from(connections)
      .where(
        and(
          eq(connections.fromRef, fromRef),
          eq(connections.kind, kind),
          eq(connections.locale, locale),
          inArray(
            connections.toRef,
            conflicted.map((r) => r.toRef)
          )
        )
      );
    return new Map(stored.map((r) => [r.toRef, r.reason]));
  } catch (err) {
    // A swallowed persist failure would be invisible: the caller still gets
    // their connections this request, but nothing is cached, so the same
    // (costly) translation re-runs on every future request for this verse.
    // Surface it as a counted metric, not just a log line.
    console.error("Failed to persist localized connections:", err);
    incr("gen_persist_failed");
    return new Map();
  }
}

/**
 * The cache-miss body: discover candidates, generate connections in English,
 * persist them. Prefers grounded discovery (data discovers, AI articulates);
 * falls back to legacy memory-based generation only when no grounding data is
 * available for this verse (e.g. corpus not yet seeded).
 *
 * Exported so the admin backfill job (lib/ai/connection-batch.ts) can drive it
 * directly — WITHOUT the per-client rate limiter and single-flight map that
 * `getConnections` wraps it in for live traffic. The job is sequential and
 * single-process (one job at a time via lib/admin/job-runner.ts), so neither
 * guard applies. The verse selection is always English; non-`en` rows come from
 * translating these (see `generateLocalizedCell` / lib/ai/connection-batch.ts).
 */
export async function generateConnectionsForCell(
  fromRef: string,
  kind: EdgeKind,
  source: SourceVerse,
  excludeRefs: string[] = [],
  provider: Provider,
  model: string,
  gen: { apiKey?: string; signal?: AbortSignal } = {}
): Promise<CellGenerationResult> {
  const genOpts = [{ provider, model, apiKey: gen.apiKey, signal: gen.signal }] as const;
  const candidates = await discoverCandidates(fromRef, kind, undefined, excludeRefs);
  const calledAI = candidates.length > 0 || excludeRefs.length === 0;
  // The legacy ungrounded path has no notion of excludeRefs — it would just
  // regenerate a similar set from memory, defeating the point of "get more."
  // Only fall back to it on a true first-time miss (no grounding data seeded
  // for this verse yet); once a caller is asking for more, an empty candidate
  // pool means the grounded data is genuinely exhausted, not unavailable.
  const generated =
    candidates.length > 0
      ? await generateGroundedConnections(
          fromRef,
          source.arabicText,
          source.translation,
          kind,
          candidates,
          "en",
          ...genOpts
        )
      : excludeRefs.length > 0
        ? []
        : await generateConnections(
            fromRef,
            source.arabicText,
            source.translation,
            kind,
            "en",
            ...genOpts
          );

  if (generated.length > 0) {
    // Attribute the row to the exact model that generated it — the caller
    // resolved the provider+model pair once and passed it straight through, so
    // there's nothing to re-resolve here.
    try {
      const inserted = await db
        .insert(connections)
        .values(
          generated.map((g) => ({
            fromRef,
            toRef: g.ref,
            kind,
            reason: g.reason,
            model,
            locale: "en",
          }))
        )
        .onConflictDoNothing()
        .returning({ toRef: connections.toRef });

      // A concurrent generation on another instance can win the same
      // (fromRef, toRef, kind, locale) row first — RETURNING omits exactly the
      // rows DO NOTHING discarded. Re-read those so this call returns what's
      // actually persisted, not the text that lost the race (mirrors the same
      // fix in lib/names/name-content.ts).
      const insertedRefs = new Set(inserted.map((r) => r.toRef));
      const conflicted = generated.filter((g) => !insertedRefs.has(g.ref));
      if (conflicted.length > 0) {
        const persisted = await db
          .select({ toRef: connections.toRef, reason: connections.reason })
          .from(connections)
          .where(
            and(
              eq(connections.fromRef, fromRef),
              eq(connections.kind, kind),
              eq(connections.locale, "en"),
              inArray(
                connections.toRef,
                conflicted.map((g) => g.ref)
              )
            )
          );
        const reasonByRef = new Map(persisted.map((r) => [r.toRef, r.reason]));
        return {
          calledAI,
          results: generated.map((g) => {
            const persistedReason = reasonByRef.get(g.ref);
            return persistedReason !== undefined ? { ...g, reason: persistedReason } : g;
          }),
        };
      }
    } catch (err) {
      // A swallowed persist failure would be invisible: the caller still gets
      // their generated connections this request, but nothing is cached, so
      // the same (costly) AI generation re-runs on every future request for
      // this verse — quietly defeating this module's "AI cost trends toward
      // zero" design. Surface it as a counted metric, not just a log line.
      console.error("Failed to persist connections:", err);
      incr("gen_persist_failed");
    }
  }

  return { results: generated, calledAI };
}
