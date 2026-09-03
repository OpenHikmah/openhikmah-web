import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/infra/db";
import { verses, connections, connectionCoverage, aiGenerations } from "@/lib/infra/db/schema";
import { generateConnectionsForCell } from "@/lib/ai/graph-service";
import { translateReason } from "@/lib/ai/translate";
import { estimateCostUsd } from "@/lib/ai/ai-cost";
import { resolveModel, type Provider } from "@/lib/ai/ai";
import { GeminiDailyQuotaError, GeminiKeyInvalidError } from "@/lib/ai/gemini-errors";
import { LOCALE_LANGUAGE_NAME, type Locale } from "@/lib/i18n/config";
import { incr } from "@/lib/infra/metrics";
import { interruptibleSleep } from "@/lib/infra/sleep";
import type { EdgeKind } from "@/types/quran";

/**
 * The admin backfill job's core: walk every (verse, kind) cell and fill the
 * connection graph so the public "+" expander never shows "Could not find
 * connections".
 *
 *  - baseline  → for every en cell with no active connection, generate.
 *  - topup     → thinnest cells first; ask for MORE via excludeRefs. When a
 *                cell returns nothing new, mark it exhausted in
 *                connection_coverage so future runs skip it and the admin
 *                never re-pays the LLM for a verse with no more real
 *                connections to find.
 *
 * Non-English rows are produced by translating the English reason (mirrors the
 * divine-names name_verse_reasons pattern) — the verse SELECTION is never
 * re-derived per locale.
 *
 * Resumable/idempotent: the work list is recomputed from the DB on every run,
 * and every cell's writes commit as it goes, so a crash or a budget stop loses
 * no completed work.
 */

const KINDS: readonly EdgeKind[] = ["thematic", "root", "contrast"];
// Al-Fatiha, Ya-Sin, Al-Mulk, Al-Kahf, Al-Baqarah, Al-Ikhlas, Ar-Rahman,
// Al-Waqiah — mirrors scripts/prewarm-graph.mjs so the most-visited verses
// fill first.
const POPULAR_SURAHS = [1, 36, 67, 18, 2, 112, 55, 56];
const PROGRESS_EVERY = 25;
// If the first N cells all throw and nothing has generated, the provider itself
// is down (bad key, quota, wrong model) — not N unlucky verses. Abort instead of
// draining `maxCalls` on a dead API.
const FAIL_FAST_THRESHOLD = 5;

export type BatchMode = "baseline" | "topup";
export type StoppedReason =
  | "completed"
  | "call-budget"
  | "cost-budget"
  | "error"
  | "cancelled"
  /** The active Gemini key hit its per-day quota. The single-pass batch stops
   *  here; the outer loop (connection-batch-loop.ts) rotates to the next key. */
  | "quota-daily"
  /** The active Gemini key is invalid / revoked. Same handling as `quota-daily`
   *  — the outer loop rotates to the next key. */
  | "key-invalid";

export interface BatchOptions {
  mode: BatchMode;
  /** Which LLM to use for this run — the admin's per-run pick. */
  provider: Provider;
  /** Which model to use — the admin's per-run pick. Empty/undefined = the
   *  resolved default for `provider`. Applied only when it belongs to `provider`. */
  model?: string;
  /** Target locales to translate the English reason into (subset of tr/ru/az). */
  locales: Locale[];
  /** Ceiling on *reserved* LLM calls this run — one per generation + one per
   *  locale translation. `callGemini` may issue up to PER_MINUTE_MAX_RETRIES real
   *  HTTP requests per reservation when it hits per-minute 429s, so against
   *  Google's quota this under-counts; it is the run's spend guard, not a request
   *  meter. `Number.POSITIVE_INFINITY` in loop mode when left blank. */
  maxCalls: number;
  /** Best-effort USD ceiling. Estimated per call (tokens aren't tracked on the
   *  generation path), so treat as approximate — maxCalls is the real guard.
   *  `Number.POSITIVE_INFINITY` in loop mode when the admin leaves it blank. */
  maxCostUsd: number;
  /** Explicit Gemini API key for this pass — the backfill loop's per-key pick.
   *  Undefined for a normal single run (uses `process.env.GEMINI_API_KEY`). */
  apiKey?: string;
  /** Delay in ms after each successful `budget.spend()` (i.e. before each LLM
   *  request), to stay under free-tier per-minute limits. 0 / undefined = none.
   *  Abort-aware — a Stop click interrupts the wait. */
  callDelayMs?: number;
}

export interface BatchHooks {
  onProgress: (line: string) => void;
}

export interface BatchSummary {
  stoppedReason: StoppedReason;
  cellsProcessed: number;
  callsUsed: number;
  costUsd: number;
  /** English connection rows newly inserted. */
  generated: number;
  /** Translated (tr/ru/az) connection rows newly inserted. */
  translated: number;
  /** Cells newly marked exhausted this run. */
  exhausted: number;
  /** Cells whose generation call threw (usually a provider/API error). */
  cellsFailed: number;
  /** Whole-run failure message (work-list build failure, or the post-loop
   *  promotion when every cell failed). Drives `job_runs.error`. */
  error?: string;
  /** Message from the most recent cell-level failure, surfaced even when the run
   *  as a whole is not marked failed. */
  lastError?: string;
  /** How many (verse × kind) cells the work list held at the start of this pass.
   *  The loop uses `0 changes on a completed pass` to detect "work fully done." */
  workListSize: number;
}

interface Cell {
  fromRef: string;
  arabicText: string;
  translation: string;
  kind: EdgeKind;
  activeCount: number;
  /** Baseline only: this cell already has English connections but is missing one
   *  or more requested-locale rows (an earlier pass stopped mid-cell). Translate
   *  the existing English reasons; do NOT run generation. */
  translateOnly?: boolean;
}

const cellKey = (ref: string, kind: string) => `${ref}|${kind}`;

/** Throttle between LLM requests in loop mode. No-op when unset. Abort-aware so a
 *  Stop click doesn't have to wait out the full delay. */
async function pace(ms: number | undefined, signal?: AbortSignal): Promise<void> {
  if (!ms || ms <= 0) return;
  await interruptibleSleep(ms, signal);
}

interface Pacer {
  waitTurn(): Promise<void>;
  noteRequest(): void;
}

/** Spaces consecutive real LLM requests by exactly one `ms` delay — across the
 *  generation→translation and cell→cell boundaries alike. `waitTurn()` before a
 *  request waits only if a prior request is owed a delay; `noteRequest()` after a
 *  request that actually went out arms the next wait. */
function createPacer(ms: number | undefined, signal?: AbortSignal): Pacer {
  let owed = false;
  return {
    async waitTurn() {
      if (owed) await pace(ms, signal);
      owed = false;
    },
    noteRequest() {
      owed = true;
    },
  };
}

/** Cost of one generation call, estimated (the generation path doesn't return
 *  token usage). Deliberately the DEFAULT_TOKENS path so the guard errs early. */
function perCallCost(provider: Provider, model: string): number {
  return estimateCostUsd(model, provider, null);
}

/**
 * Cells (baseline only) that already have active English connections but are
 * missing an active row in one or more of `targetLocales` for some English
 * target. This catches the gap left when an earlier pass generated the English
 * rows and then stopped (budget / daily quota / invalid key / Stop) before
 * translating — baseline would otherwise never revisit the cell.
 *
 * Row-by-row (not a count compare) so a retired-and-replaced English edge can't
 * make a locale look complete when it isn't. Mirrors how `translateCellReasons`
 * decides what to insert.
 */
async function findTranslationGaps(targetLocales: Locale[]): Promise<Set<string>> {
  if (targetLocales.length === 0) return new Set();

  const rows = await db
    .select({
      fromRef: connections.fromRef,
      toRef: connections.toRef,
      kind: connections.kind,
      locale: connections.locale,
    })
    .from(connections)
    .where(
      and(eq(connections.status, "active"), inArray(connections.locale, ["en", ...targetLocales]))
    );

  // key = `${fromRef}|${kind}` → locale → set of toRefs
  const byCell = new Map<string, Map<string, Set<string>>>();
  for (const r of rows) {
    const key = cellKey(r.fromRef, r.kind);
    let locales = byCell.get(key);
    if (!locales) byCell.set(key, (locales = new Map()));
    let refs = locales.get(r.locale);
    if (!refs) locales.set(r.locale, (refs = new Set()));
    refs.add(r.toRef);
  }

  const gaps = new Set<string>();
  for (const [key, locales] of byCell) {
    const enRefs = locales.get("en");
    if (!enRefs || enRefs.size === 0) continue;
    for (const loc of targetLocales) {
      const locRefs = locales.get(loc) ?? new Set<string>();
      for (const ref of enRefs) {
        if (!locRefs.has(ref)) {
          gaps.add(key);
          break;
        }
      }
      if (gaps.has(key)) break;
    }
  }
  return gaps;
}

/** Builds the ordered work list from current DB state. `locales` is only used in
 *  baseline mode, to also pick up cells whose English rows exist but whose
 *  translations were never finished. */
async function buildWorkList(mode: BatchMode, locales: Locale[] = []): Promise<Cell[]> {
  const verseRows = await db
    .select({
      ref: verses.ref,
      surah: verses.surah,
      ayah: verses.ayah,
      arabicText: verses.arabicText,
      translation: verses.translation,
    })
    .from(verses)
    .orderBy(
      sql`(${verses.surah} = ANY(${sql.raw(`ARRAY[${POPULAR_SURAHS.join(",")}]`)})) DESC`,
      verses.surah,
      verses.ayah
    );

  const coveredEn = new Set<string>();
  for (const row of await db
    .selectDistinct({ fromRef: connections.fromRef, kind: connections.kind })
    .from(connections)
    .where(and(eq(connections.status, "active"), eq(connections.locale, "en")))) {
    coveredEn.add(cellKey(row.fromRef, row.kind));
  }

  const exhausted = new Set<string>();
  const countByCell = new Map<string, number>();
  for (const row of await db
    .select()
    .from(connectionCoverage)
    .where(eq(connectionCoverage.locale, "en"))) {
    if (row.exhaustedAt) exhausted.add(cellKey(row.fromRef, row.kind));
    countByCell.set(cellKey(row.fromRef, row.kind), row.activeCount);
  }

  const translationGaps =
    mode === "baseline" ? await findTranslationGaps(locales) : new Set<string>();

  const cells: Cell[] = [];
  const gapCells: Cell[] = [];
  for (const v of verseRows) {
    for (const kind of KINDS) {
      const key = cellKey(v.ref, kind);
      if (mode === "baseline") {
        if (coveredEn.has(key)) {
          // Already has English rows — normally excluded, but pick it up if its
          // translations were left unfinished.
          if (translationGaps.has(key)) {
            gapCells.push({
              fromRef: v.ref,
              arabicText: v.arabicText,
              translation: v.translation,
              kind,
              activeCount: countByCell.get(key) ?? 1,
              translateOnly: true,
            });
          }
          continue;
        }
      } else {
        // topup: only cells that already have >=1 connection (filling a
        // zero-connection cell is baseline's job) and aren't exhausted.
        if (!coveredEn.has(key) || exhausted.has(key)) continue;
      }
      cells.push({
        fromRef: v.ref,
        arabicText: v.arabicText,
        translation: v.translation,
        kind,
        activeCount: countByCell.get(key) ?? (coveredEn.has(key) ? 1 : 0),
      });
    }
  }

  // topup: thinnest cells first (stable — preserves popular-surah order within
  // an equal count).
  if (mode === "topup") {
    cells.sort((a, b) => a.activeCount - b.activeCount);
  }
  // baseline: finish real (zero-English) coverage first, then close translation
  // gaps.
  return [...cells, ...gapCells];
}

/** Existing active en connection targets for a cell. */
async function activeToRefs(fromRef: string, kind: EdgeKind, locale: Locale): Promise<string[]> {
  const rows = await db
    .select({ toRef: connections.toRef })
    .from(connections)
    .where(
      and(
        eq(connections.fromRef, fromRef),
        eq(connections.kind, kind),
        eq(connections.status, "active"),
        eq(connections.locale, locale)
      )
    );
  return rows.map((r) => r.toRef);
}

/**
 * Ensures every target locale has a translated copy of each English reason for
 * this cell. Skips rows that already exist. Returns the rows inserted and, if a
 * budget ran out mid-cell, the reason the run must stop.
 *
 * `budget.spend()` is called before every translation request — it debits the
 * shared call/cost counters and returns false once either ceiling is hit, so a
 * cell with many target locales can never overshoot the run's `maxCalls`.
 */
async function translateCellReasons(
  fromRef: string,
  kind: EdgeKind,
  locales: Locale[],
  provider: Provider,
  model: string,
  budget: { spend: () => boolean; stoppedReason: StoppedReason | null },
  gen: { apiKey?: string; signal?: AbortSignal; pacer?: Pacer } = {}
): Promise<{ inserted: number; stoppedReason: StoppedReason | null }> {
  if (locales.length === 0) return { inserted: 0, stoppedReason: null };

  const enRows = await db
    .select({ toRef: connections.toRef, reason: connections.reason })
    .from(connections)
    .where(
      and(
        eq(connections.fromRef, fromRef),
        eq(connections.kind, kind),
        eq(connections.status, "active"),
        eq(connections.locale, "en")
      )
    );
  if (enRows.length === 0) return { inserted: 0, stoppedReason: null };

  let inserted = 0;

  for (const locale of locales) {
    const existing = new Set(await activeToRefs(fromRef, kind, locale));
    for (const en of enRows) {
      if (existing.has(en.toRef)) continue;
      if (!budget.spend()) return { inserted, stoppedReason: budget.stoppedReason };
      await gen.pacer?.waitTurn();

      let translated: string;
      try {
        translated = await translateReason(en.reason, LOCALE_LANGUAGE_NAME[locale], {
          feature: "connections",
          provider,
          model,
          apiKey: gen.apiKey,
          signal: gen.signal,
        });
        gen.pacer?.noteRequest();
      } catch (err) {
        // A daily-quota hit or an invalid key is not a translation problem —
        // bubble it to the single handler in runConnectionBatch so the pass ends
        // "quota-daily" / "key-invalid" and the loop rotates keys.
        if (err instanceof GeminiDailyQuotaError || err instanceof GeminiKeyInvalidError) throw err;
        gen.pacer?.noteRequest();
        console.error(`connection-batch: translation failed ${fromRef} ${kind} ${locale}:`, err);
        incr("connection_batch_translate_failed");
        continue;
      }
      // A blank translation must never replace the Tanzih-checked English
      // reason — skip the insert and let the next run retry (mirrors the
      // names route).
      if (translated.trim() === "") {
        console.error(`connection-batch: empty translation ${fromRef} ${kind} ${locale}`);
        incr("connection_batch_translate_empty");
        continue;
      }

      const rows = await db
        .insert(connections)
        .values({
          fromRef,
          toRef: en.toRef,
          kind,
          reason: translated,
          locale,
          model,
        })
        .onConflictDoNothing()
        .returning({ toRef: connections.toRef });
      if (rows.length > 0) inserted++;

      // Cost/audit visibility for translation spend (tokens not tracked here).
      try {
        await db.insert(aiGenerations).values({ fromRef, kind, model, promptVersion: null });
      } catch (err) {
        console.error("connection-batch: ai_generations log failed:", err);
      }
    }
  }
  return { inserted, stoppedReason: null };
}

async function upsertCoverage(
  fromRef: string,
  kind: EdgeKind,
  fields: { activeCount?: number; exhaustedAt?: Date | null; lastError?: string | null }
): Promise<void> {
  const now = new Date();
  await db
    .insert(connectionCoverage)
    .values({
      fromRef,
      kind,
      locale: "en",
      activeCount: fields.activeCount ?? 0,
      exhaustedAt: fields.exhaustedAt ?? null,
      lastAttemptAt: now,
      lastError: fields.lastError ?? null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [connectionCoverage.fromRef, connectionCoverage.kind, connectionCoverage.locale],
      set: {
        ...(fields.activeCount !== undefined ? { activeCount: fields.activeCount } : {}),
        ...(fields.exhaustedAt !== undefined ? { exhaustedAt: fields.exhaustedAt } : {}),
        lastAttemptAt: now,
        lastError: fields.lastError ?? null,
        updatedAt: now,
      },
    });
}

export async function runConnectionBatch(
  opts: BatchOptions,
  hooks: BatchHooks,
  signal?: AbortSignal
): Promise<BatchSummary> {
  const summary: BatchSummary = {
    stoppedReason: "completed",
    cellsProcessed: 0,
    callsUsed: 0,
    costUsd: 0,
    generated: 0,
    translated: 0,
    exhausted: 0,
    cellsFailed: 0,
    workListSize: 0,
  };

  // Resolve the effective model once, up front: with no per-run pick,
  // `callAIDetailed` inside generation still applies the connections
  // flag/env/global-model precedence, so the budget estimate, progress line,
  // and persisted `model` must resolve the same way or they'd disagree with
  // what actually ran. Passed as an explicit override everywhere below.
  const model = await resolveModel("connections", opts.provider, opts.model);

  let cells: Cell[];
  try {
    cells = await buildWorkList(opts.mode, opts.locales);
  } catch (err) {
    summary.stoppedReason = "error";
    summary.error = err instanceof Error ? err.message : String(err);
    hooks.onProgress(`[${opts.mode}] failed to build work list: ${summary.error}`);
    return summary;
  }
  summary.workListSize = cells.length;

  hooks.onProgress(
    `[${opts.mode}] ${cells.length} cells to consider | provider=${opts.provider} | ` +
      `model=${model} | ` +
      `locales=${opts.locales.join(",") || "none"} | maxCalls=${opts.maxCalls} | ` +
      `maxCost=$${opts.maxCostUsd}`
  );

  const callCost = perCallCost(opts.provider, model);

  // Shared spend guard. `spend()` is called before EVERY LLM request (one
  // generation + one per locale translation per cell); it debits the counters
  // only when both ceilings still allow the *upcoming* call, and records which
  // ceiling stopped the run otherwise. Rejecting when the next call would cross
  // a ceiling (not merely when it already has) keeps a run from overspending
  // `maxCostUsd` by one call. This is also what keeps a multi-locale cell from
  // overshooting `maxCalls`.
  const wouldExceedBudget = () =>
    summary.callsUsed + 1 > opts.maxCalls || summary.costUsd + callCost > opts.maxCostUsd;

  const budget: { spend: () => boolean; stoppedReason: StoppedReason | null } = {
    stoppedReason: null,
    spend() {
      if (summary.callsUsed + 1 > opts.maxCalls) {
        this.stoppedReason = "call-budget";
        return false;
      }
      if (summary.costUsd + callCost > opts.maxCostUsd) {
        this.stoppedReason = "cost-budget";
        return false;
      }
      summary.callsUsed++;
      summary.costUsd += callCost;
      return true;
    },
  };

  let consecutiveFailures = 0;
  const pacer = createPacer(opts.callDelayMs, signal);

  for (const cell of cells) {
    // Cooperative cancel from the admin panel (job-runner aborts this signal).
    // Between-cell granularity matches the budget stop — at most one more cell's
    // worth of calls after the click.
    if (signal?.aborted) {
      summary.stoppedReason = "cancelled";
      break;
    }
    if (wouldExceedBudget()) {
      summary.stoppedReason = summary.callsUsed + 1 > opts.maxCalls ? "call-budget" : "cost-budget";
      break;
    }

    try {
      let exhaustedThisCell = false;

      // `translateOnly` cells (baseline, closing a translation gap left by an
      // earlier mid-cell stop) skip generation entirely — no reservation, no
      // grounding call — and go straight to translating existing English rows.
      if (!cell.translateOnly) {
        const excludeRefs =
          opts.mode === "topup" ? await activeToRefs(cell.fromRef, cell.kind, "en") : [];

        // Reserve the generation call up front. If the budget is already spent we
        // stop before making the request.
        if (!budget.spend()) {
          summary.stoppedReason = budget.stoppedReason ?? "call-budget";
          break;
        }

        await pacer.waitTurn();
        const { results, calledAI } = await generateConnectionsForCell(
          cell.fromRef,
          cell.kind,
          { arabicText: cell.arabicText, translation: cell.translation },
          excludeRefs,
          "en",
          opts.provider,
          model,
          { apiKey: opts.apiKey, signal }
        );
        if (!calledAI) {
          // No grounding data / drained pool — no request was actually made, so
          // refund the reservation and don't arm the pacer (no call to space out).
          summary.callsUsed--;
          summary.costUsd -= callCost;
        } else {
          // A request went out and came back without throwing — the provider is
          // alive, so a later isolated failure isn't the fail-fast case.
          consecutiveFailures = 0;
          pacer.noteRequest();
        }
        summary.generated += results.length;

        if (opts.mode === "topup" && excludeRefs.length > 0 && results.length === 0) {
          // Grounded pool is genuinely empty for this cell — record it so no
          // future run pays for it again.
          await upsertCoverage(cell.fromRef, cell.kind, {
            exhaustedAt: new Date(),
            activeCount: excludeRefs.length,
          });
          summary.exhausted++;
          exhaustedThisCell = true;
        }
      }

      if (!exhaustedThisCell) {
        const activeCount = (await activeToRefs(cell.fromRef, cell.kind, "en")).length;
        const xlt = await translateCellReasons(
          cell.fromRef,
          cell.kind,
          opts.locales,
          opts.provider,
          model,
          budget,
          { apiKey: opts.apiKey, signal, pacer }
        );
        summary.translated += xlt.inserted;
        await upsertCoverage(cell.fromRef, cell.kind, { activeCount, lastError: null });
        if (xlt.stoppedReason) {
          summary.stoppedReason = xlt.stoppedReason;
          summary.cellsProcessed++;
          break;
        }
      }
    } catch (err) {
      // A cooperative cancel (Stop button) can land here as the rejection of an
      // in-flight `pace()` delay or a `callGemini` rate-limit backoff. That is
      // not a cell failure — don't poison the coverage row or trip fail-fast.
      if (signal?.aborted || (err instanceof Error && err.name === "AbortError")) {
        summary.stoppedReason = "cancelled";
        break;
      }
      if (err instanceof GeminiDailyQuotaError) {
        // Not a per-cell failure: the key is spent for the day. End the pass
        // cleanly so the outer loop rotates to the next key. Deliberately does
        // NOT touch cellsFailed / consecutiveFailures / coverage lastError.
        summary.stoppedReason = "quota-daily";
        summary.lastError = err.message;
        hooks.onProgress(
          `[${opts.mode}] daily quota exhausted for the active key at ${cell.fromRef} ${cell.kind} — ending pass to rotate`
        );
        break;
      }
      if (err instanceof GeminiKeyInvalidError) {
        // The key is invalid / revoked — per-key, so the loop rotates. Same
        // clean-stop treatment as a daily-quota hit.
        summary.stoppedReason = "key-invalid";
        summary.lastError = err.message;
        hooks.onProgress(
          `[${opts.mode}] active key invalid/blocked at ${cell.fromRef} ${cell.kind} — ending pass to rotate`
        );
        break;
      }
      const message = err instanceof Error ? err.message : String(err);
      console.error(`connection-batch: cell ${cell.fromRef} ${cell.kind} failed:`, err);
      incr("connection_batch_cell_failed");
      summary.cellsFailed++;
      summary.lastError = message;
      consecutiveFailures++;
      // Surface the reason in the job log tail, not just the server console —
      // this is the only place the admin sees *why* a run generated nothing.
      hooks.onProgress(`[${opts.mode}] cell ${cell.fromRef} ${cell.kind} FAILED: ${message}`);
      // One bad verse must not abort the run — record and move on.
      await upsertCoverage(cell.fromRef, cell.kind, { lastError: message }).catch(() => {});

      if (summary.generated === 0 && consecutiveFailures >= FAIL_FAST_THRESHOLD) {
        summary.stoppedReason = "error";
        summary.error = `aborted after ${consecutiveFailures} consecutive cell failures with nothing generated — the provider is likely down. Last error: ${message}`;
        hooks.onProgress(`[${opts.mode}] ${summary.error}`);
        summary.cellsProcessed++;
        break;
      }
    }

    summary.cellsProcessed++;
    if (summary.cellsProcessed % PROGRESS_EVERY === 0) {
      hooks.onProgress(
        `[${opts.mode}] ${summary.cellsProcessed}/${cells.length} cells | ` +
          `${summary.callsUsed} calls | $${summary.costUsd.toFixed(2)} | ` +
          `gen=${summary.generated} xlt=${summary.translated} exh=${summary.exhausted} ` +
          `fail=${summary.cellsFailed}`
      );
    }
  }

  // A run that made calls, generated nothing, and hit only failures isn't a
  // successful "found no new connections" pass — mark it failed so the Jobs page
  // shows it in the error style with the reason, not a green "success / gen=0".
  if (summary.stoppedReason === "completed" && summary.generated === 0 && summary.cellsFailed > 0) {
    summary.stoppedReason = "error";
    summary.error = `${summary.cellsFailed}/${summary.cellsProcessed} cells failed, 0 generated — last error: ${summary.lastError}`;
  }

  hooks.onProgress(
    `[${opts.mode}] DONE (${summary.stoppedReason}) | ${summary.cellsProcessed} cells | ` +
      `${summary.callsUsed} calls | $${summary.costUsd.toFixed(2)} | ` +
      `gen=${summary.generated} xlt=${summary.translated} exh=${summary.exhausted} ` +
      `fail=${summary.cellsFailed}`
  );
  return summary;
}
