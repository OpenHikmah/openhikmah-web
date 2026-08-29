import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/infra/db";
import { verses, connections, connectionCoverage, aiGenerations } from "@/lib/infra/db/schema";
import { generateConnectionsForCell } from "@/lib/ai/graph-service";
import { translateReason } from "@/lib/ai/translate";
import { estimateCostUsd } from "@/lib/ai/ai-cost";
import { resolveModel, type Provider } from "@/lib/ai/ai";
import { LOCALE_LANGUAGE_NAME, type Locale } from "@/lib/i18n/config";
import { incr } from "@/lib/infra/metrics";
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

export type BatchMode = "baseline" | "topup";
export type StoppedReason = "completed" | "call-budget" | "cost-budget" | "error" | "cancelled";

export interface BatchOptions {
  mode: BatchMode;
  /** Which LLM to use for this run — the admin's per-run pick. */
  provider: Provider;
  /** Which model to use — the admin's per-run pick. Empty/undefined = the
   *  resolved default for `provider`. Applied only when it belongs to `provider`. */
  model?: string;
  /** Target locales to translate the English reason into (subset of tr/ru/az). */
  locales: Locale[];
  /** Hard ceiling on LLM calls this run. Always exact. */
  maxCalls: number;
  /** Best-effort USD ceiling. Estimated per call (tokens aren't tracked on the
   *  generation path), so treat as approximate — maxCalls is the real guard. */
  maxCostUsd: number;
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
  error?: string;
}

interface Cell {
  fromRef: string;
  arabicText: string;
  translation: string;
  kind: EdgeKind;
  activeCount: number;
}

const cellKey = (ref: string, kind: string) => `${ref}|${kind}`;

/** Cost of one generation call, estimated (the generation path doesn't return
 *  token usage). Deliberately the DEFAULT_TOKENS path so the guard errs early. */
function perCallCost(provider: Provider, model: string): number {
  return estimateCostUsd(model, provider, null);
}

/** Builds the ordered work list from current DB state. */
async function buildWorkList(mode: BatchMode): Promise<Cell[]> {
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

  const cells: Cell[] = [];
  for (const v of verseRows) {
    for (const kind of KINDS) {
      const key = cellKey(v.ref, kind);
      if (mode === "baseline") {
        // Only cells with no active English connection.
        if (coveredEn.has(key)) continue;
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
  return cells;
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
  budget: { spend: () => boolean; stoppedReason: StoppedReason | null }
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

      let translated: string;
      try {
        translated = await translateReason(en.reason, LOCALE_LANGUAGE_NAME[locale], {
          feature: "connections",
          provider,
          model,
        });
      } catch (err) {
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
  };

  // Resolve the effective model once, up front: with no per-run pick,
  // `callAIDetailed` inside generation still applies the connections
  // flag/env/global-model precedence, so the budget estimate, progress line,
  // and persisted `model` must resolve the same way or they'd disagree with
  // what actually ran. Passed as an explicit override everywhere below.
  const model = await resolveModel("connections", opts.provider, opts.model);

  let cells: Cell[];
  try {
    cells = await buildWorkList(opts.mode);
  } catch (err) {
    summary.stoppedReason = "error";
    summary.error = err instanceof Error ? err.message : String(err);
    hooks.onProgress(`[${opts.mode}] failed to build work list: ${summary.error}`);
    return summary;
  }

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
      const excludeRefs =
        opts.mode === "topup" ? await activeToRefs(cell.fromRef, cell.kind, "en") : [];

      // Reserve the generation call up front. If the budget is already spent we
      // stop before making the request.
      if (!budget.spend()) {
        summary.stoppedReason = budget.stoppedReason ?? "call-budget";
        break;
      }

      const { results, calledAI } = await generateConnectionsForCell(
        cell.fromRef,
        cell.kind,
        { arabicText: cell.arabicText, translation: cell.translation },
        excludeRefs,
        "en",
        opts.provider,
        model
      );
      if (!calledAI) {
        // No grounding data / drained pool — no request was actually made, so
        // refund the reservation.
        summary.callsUsed--;
        summary.costUsd -= callCost;
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
      } else {
        const activeCount = (await activeToRefs(cell.fromRef, cell.kind, "en")).length;
        const xlt = await translateCellReasons(
          cell.fromRef,
          cell.kind,
          opts.locales,
          opts.provider,
          model,
          budget
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
      const message = err instanceof Error ? err.message : String(err);
      console.error(`connection-batch: cell ${cell.fromRef} ${cell.kind} failed:`, err);
      incr("connection_batch_cell_failed");
      // One bad verse must not abort the run — record and move on.
      await upsertCoverage(cell.fromRef, cell.kind, { lastError: message }).catch(() => {});
    }

    summary.cellsProcessed++;
    if (summary.cellsProcessed % PROGRESS_EVERY === 0) {
      hooks.onProgress(
        `[${opts.mode}] ${summary.cellsProcessed}/${cells.length} cells | ` +
          `${summary.callsUsed} calls | $${summary.costUsd.toFixed(2)} | ` +
          `gen=${summary.generated} xlt=${summary.translated} exh=${summary.exhausted}`
      );
    }
  }

  hooks.onProgress(
    `[${opts.mode}] DONE (${summary.stoppedReason}) | ${summary.cellsProcessed} cells | ` +
      `${summary.callsUsed} calls | $${summary.costUsd.toFixed(2)} | ` +
      `gen=${summary.generated} xlt=${summary.translated} exh=${summary.exhausted}`
  );
  return summary;
}
