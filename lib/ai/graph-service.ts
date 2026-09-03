import { and, eq, inArray, notInArray } from "drizzle-orm";
import { db } from "@/lib/infra/db";
import { connections, type Connection } from "@/lib/infra/db/schema";
import { generateConnections, generateGroundedConnections } from "@/lib/ai/connection-generator";
import { resolveModel, resolveProvider, type Provider } from "@/lib/ai/ai";
import { discoverCandidates } from "@/lib/ai/connection-discovery";
import { resolveVerse } from "@/lib/quran/verse-resolver";
import { consume, RateLimitError } from "@/lib/infra/rate-limit";
import { incr } from "@/lib/infra/metrics";
import type { Locale } from "@/lib/i18n/config";
import type { ConnectionResult, EdgeKind } from "@/types/quran";

/**
 * The persistent knowledge graph. Reads connections from Postgres; only on a
 * miss does it call the AI, then writes the result back so every later reader
 * gets it for free. This is what makes AI cost trend toward zero.
 */

/**
 * Single-flight registry: concurrent cache misses for the SAME verse+kind+locale
 * share one in-flight generation instead of each firing its own (expensive) AI
 * call. Per-process — full coverage on the single box; a multi-instance deployment
 * would need a Redis lock to coalesce across processes (deferred). Keyed by
 * `${fromRef}:${kind}:${locale}:${excludeRefs}`; entries are removed as soon as
 * the generation settles.
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
  /** Language the reason text is generated and cached in. Reads and writes are
   *  both keyed on this, so each locale gets its own cached reason instead of
   *  sharing whichever locale first triggered generation. Defaults to "en". */
  locale?: Locale;
  /** Forces a specific LLM provider for the miss-path generation (the admin
   *  batch job's per-run pick). Unset for live traffic, which uses the
   *  feature/global provider flags. */
  provider?: Provider;
  /** Forces a specific model for the miss-path generation (applied only when it
   *  belongs to the resolved provider). Batch job's per-run pick. */
  model?: string;
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

  const existing = await db
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

  if (existing.length > 0) {
    return hydrate(existing, kind);
  }

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

  // Single-flight: if an identical generation is already running, join it rather
  // than starting a second AI call. The get→set below MUST stay synchronous (no
  // await between them) or two concurrent callers could both become the leader.
  // The exclude set, locale, provider, and model are folded into the key so a
  // "get more" request, a different-locale request, or a request pinned to a
  // different provider/model never coalesces with an unrelated one.
  const key = `${fromRef}:${kind}:${locale}:${provider}:${model}:${[...excludeRefs].sort().join(",")}`;
  const pending = inFlight.get(key);
  if (pending) {
    incr("gen_coalesced");
    return (await pending).results;
  }

  incr("gen_started");
  const work = generateConnectionsForCell(
    fromRef,
    kind,
    source,
    excludeRefs,
    locale,
    provider,
    model
  );
  inFlight.set(key, work);
  try {
    return (await work).results;
  } finally {
    inFlight.delete(key);
  }
}

/**
 * The cache-miss body: discover candidates, generate connections, persist them.
 * Prefers grounded discovery (data discovers, AI articulates); falls back to
 * legacy memory-based generation only when no grounding data is available for
 * this verse (e.g. corpus not yet seeded).
 *
 * Exported so the admin backfill job (lib/ai/connection-batch.ts) can drive it
 * directly — WITHOUT the per-client rate limiter and single-flight map that
 * `getConnections` wraps it in for live traffic. The job is sequential and
 * single-process (one job at a time via lib/admin/job-runner.ts), so neither
 * guard applies.
 */
export async function generateConnectionsForCell(
  fromRef: string,
  kind: EdgeKind,
  source: SourceVerse,
  excludeRefs: string[] = [],
  locale: Locale = "en",
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
          locale,
          ...genOpts
        )
      : excludeRefs.length > 0
        ? []
        : await generateConnections(
            fromRef,
            source.arabicText,
            source.translation,
            kind,
            locale,
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
            locale,
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
              eq(connections.locale, locale),
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
