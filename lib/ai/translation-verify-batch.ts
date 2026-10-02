import { and, asc, eq, isNull, ne } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/infra/db";
import { connections } from "@/lib/infra/db/schema";
import { resolveModel } from "@/lib/ai/ai";
import {
  createPacer,
  perCallCost,
  type BatchHooks,
  type StoppedReason,
} from "@/lib/ai/connection-batch";
import { checkTranslationMeaning, TranslationBudgetExhaustedError } from "@/lib/ai/translate";
import type { VerifyOptions, VerifySummary } from "@/lib/ai/connection-verify-batch";
import type { VerifyLoopVariant } from "@/lib/ai/connection-verify-loop";
import {
  GeminiDailyQuotaError,
  GeminiKeyInvalidError,
  GeminiRateLimitError,
} from "@/lib/ai/gemini-errors";
import { formatTranslationProgress, getTranslationProgress } from "@/lib/ai/verification-progress";
import { LOCALE_LANGUAGE_NAME, type Locale } from "@/lib/i18n/config";
import { incr } from "@/lib/infra/metrics";

/**
 * Translation re-verification backfill. Translations made before the
 * back-translation meaning check existed (or whose check was never recorded)
 * were only checked for shape, refusal, length and an English-only Tashbih
 * regex, so a change of meaning made in tr/ru/az would have gone unnoticed.
 *
 * Every ACTIVE non-English connection without `translation_checked_at` is run
 * through the same two-call check `translateReason` uses (back-translate without
 * the source, then compare with the canonical English reason of the same pair):
 *
 * - `same`   -> stamped checked, left active
 * - `drift`  -> set to `flagged` (hidden: users see the English reason instead,
 *               exactly as for a missing translation) and stamped, so an admin
 *               who restores a false positive from the review queue is not
 *               flagged again; `reviewedAt` stays unset so it shows as pending
 * - no active English row to compare with -> flagged and stamped (it cannot be
 *               verified, and a translation of a retired connection should not be served)
 * - the check failed (error, refusal, malformed reply) -> left unstamped and
 *               counted as a failed unit, so the next run retries it
 *
 * One unit is one translated row and costs two LLM calls, each paced and charged
 * to the same budget. Stop reasons mirror the connection verification job. The
 * work list is loaded once at the start; rows are small, and a row flagged or
 * stamped during the run is simply done.
 *
 * Reuses the `VerifySummary` shape: here "cells" are translated rows.
 */

const PROGRESS_EVERY = 25;
const FAIL_FAST_THRESHOLD = 5;
/** Calls one row costs: the back-translation and the comparison. */
const CALLS_PER_ROW = 2;

interface WorkRow {
  id: number;
  fromRef: string;
  kind: string;
  toRef: string;
  locale: string;
  translated: string;
  /** Snapshot of the review state: an admin decision made mid-run changes it. */
  reviewedAt: Date | null;
  /** Canonical English reason of the same pair, or null if there is no active one. */
  source: string | null;
}

async function buildWorkList(): Promise<WorkRow[]> {
  const en = alias(connections, "en_row");
  return db
    .select({
      id: connections.id,
      fromRef: connections.fromRef,
      kind: connections.kind,
      toRef: connections.toRef,
      locale: connections.locale,
      translated: connections.reason,
      reviewedAt: connections.reviewedAt,
      source: en.reason,
    })
    .from(connections)
    .leftJoin(
      en,
      and(
        eq(en.fromRef, connections.fromRef),
        eq(en.toRef, connections.toRef),
        eq(en.kind, connections.kind),
        eq(en.locale, "en"),
        eq(en.status, "active")
      )
    )
    .where(
      and(
        ne(connections.locale, "en"),
        eq(connections.status, "active"),
        isNull(connections.translationCheckedAt)
      )
    )
    .orderBy(
      asc(connections.fromRef),
      asc(connections.kind),
      asc(connections.toRef),
      asc(connections.locale)
    );
}

async function logProgress(hooks: BatchHooks): Promise<void> {
  try {
    hooks.onProgress(
      `[verify-translations] progress: ${formatTranslationProgress(await getTranslationProgress())}`
    );
  } catch (err) {
    console.error("translation-verify: progress lookup failed:", err);
    incr("translation_reverify_progress_failed");
  }
}

/**
 * Records the check and, on drift, flags the row as a fresh pending review item
 * (reviewedAt cleared, so a row an admin approved earlier surfaces again). The
 * flag only applies if the row is still active with the review state the work
 * list saw: if an admin flagged or restored it meanwhile, their decision wins
 * and the stale verdict is dropped (the row is still stamped as checked).
 * Returns whether the row was flagged.
 */
async function stamp(row: WorkRow, flag: boolean): Promise<boolean> {
  const now = new Date();
  if (flag) {
    const flagged = await db
      .update(connections)
      .set({ translationCheckedAt: now, status: "flagged", reviewedAt: null, reviewedBy: null })
      .where(
        and(
          eq(connections.id, row.id),
          eq(connections.status, "active"),
          row.reviewedAt === null
            ? isNull(connections.reviewedAt)
            : eq(connections.reviewedAt, row.reviewedAt)
        )
      )
      .returning({ id: connections.id });
    if (flagged.length > 0) return true;
  }
  await db.update(connections).set({ translationCheckedAt: now }).where(eq(connections.id, row.id));
  return false;
}

export async function runTranslationVerifyBatch(
  opts: VerifyOptions,
  hooks: BatchHooks,
  signal?: AbortSignal
): Promise<VerifySummary> {
  const summary: VerifySummary = {
    stoppedReason: "completed",
    cellsProcessed: 0,
    callsUsed: 0,
    costUsd: 0,
    cellsVerified: 0,
    rowsFlagged: 0,
    cellsFailed: 0,
    workListSize: 0,
  };

  const model = await resolveModel("connections", opts.provider, opts.model);

  let rows: WorkRow[];
  try {
    rows = await buildWorkList();
  } catch (err) {
    summary.stoppedReason = "error";
    summary.error = err instanceof Error ? err.message : String(err);
    hooks.onProgress(`[verify-translations] failed to build work list: ${summary.error}`);
    return summary;
  }
  summary.workListSize = rows.length;
  hooks.onProgress(
    `[verify-translations] ${rows.length} translations to check | provider=${opts.provider} | ` +
      `model=${model} | maxCalls=${opts.maxCalls} | maxCost=$${opts.maxCostUsd}`
  );
  await logProgress(hooks);

  const callCost = perCallCost(opts.provider, model);
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
  const pacer = createPacer(opts.callDelayMs, signal);
  let consecutiveFailures = 0;

  for (const row of rows) {
    if (signal?.aborted) {
      summary.stoppedReason = "cancelled";
      break;
    }
    // A row needs both calls: stop before starting one the budget cannot finish.
    if (summary.callsUsed + CALLS_PER_ROW > opts.maxCalls) {
      summary.stoppedReason = "call-budget";
      break;
    }
    if (summary.costUsd + callCost * CALLS_PER_ROW > opts.maxCostUsd) {
      summary.stoppedReason = "cost-budget";
      break;
    }

    try {
      if (row.source === null) {
        const flagged = await stamp(row, true);
        summary.cellsVerified++;
        if (flagged) {
          summary.rowsFlagged++;
          incr("translation_reverify_flagged");
          hooks.onProgress(
            `[verify-translations] ${row.fromRef}->${row.toRef} ${row.kind} ${row.locale}: no active English reason to compare with, flagged`
          );
        }
      } else {
        const verdict = await checkTranslationMeaning(
          row.source,
          row.translated,
          LOCALE_LANGUAGE_NAME[row.locale as Locale],
          {
            feature: "connections",
            provider: opts.provider,
            model,
            apiKey: opts.apiKey,
            signal,
          },
          { spendBudget: () => budget.spend(), pacer }
        );
        if (verdict === "same" || verdict === "drift") {
          const flagged = await stamp(row, verdict === "drift");
          summary.cellsVerified++;
          if (flagged) {
            summary.rowsFlagged++;
            incr("translation_reverify_flagged");
            hooks.onProgress(
              `[verify-translations] ${row.fromRef}->${row.toRef} ${row.kind} ${row.locale}: meaning drifted from the English, flagged for review`
            );
          }
        } else {
          throw new Error(`meaning check was inconclusive (${verdict})`);
        }
      }
      consecutiveFailures = 0;
    } catch (err) {
      if (signal?.aborted || (err instanceof Error && err.name === "AbortError")) {
        summary.stoppedReason = "cancelled";
        break;
      }
      if (err instanceof TranslationBudgetExhaustedError) {
        summary.stoppedReason = budget.stoppedReason ?? "call-budget";
        hooks.onProgress(
          "[verify-translations] budget exhausted mid-check, nothing changed for that row, stopping"
        );
        break;
      }
      if (err instanceof GeminiDailyQuotaError) {
        summary.stoppedReason = "quota-daily";
        summary.lastError = err.message;
        hooks.onProgress(
          "[verify-translations] daily quota exhausted for the active key, ending the run"
        );
        break;
      }
      if (err instanceof GeminiKeyInvalidError) {
        summary.stoppedReason = "key-invalid";
        summary.lastError = err.message;
        hooks.onProgress("[verify-translations] active key invalid or blocked, ending the run");
        break;
      }
      if (err instanceof GeminiRateLimitError) {
        summary.stoppedReason = "rate-limited";
        summary.lastError = err.message;
        hooks.onProgress("[verify-translations] active key rate-limited, ending the run");
        break;
      }
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `translation-verify: ${row.fromRef}->${row.toRef} ${row.kind} ${row.locale} failed:`,
        err
      );
      incr("translation_reverify_row_failed");
      summary.cellsFailed++;
      summary.lastError = message;
      consecutiveFailures++;
      hooks.onProgress(
        `[verify-translations] ${row.fromRef}->${row.toRef} ${row.kind} ${row.locale} FAILED: ${message}`
      );
      if (summary.cellsVerified === 0 && consecutiveFailures >= FAIL_FAST_THRESHOLD) {
        summary.stoppedReason = "error";
        summary.error = `aborted after ${consecutiveFailures} consecutive failures with nothing checked, the provider is likely down. Last error: ${message}`;
        hooks.onProgress(`[verify-translations] ${summary.error}`);
        summary.cellsProcessed++;
        break;
      }
    }

    summary.cellsProcessed++;
    if (summary.cellsProcessed % PROGRESS_EVERY === 0) {
      hooks.onProgress(
        `[verify-translations] ${summary.cellsProcessed}/${rows.length} rows | ${summary.callsUsed} calls | ` +
          `$${summary.costUsd.toFixed(2)} | checked=${summary.cellsVerified} ` +
          `flagged=${summary.rowsFlagged} fail=${summary.cellsFailed}`
      );
      await logProgress(hooks);
    }
  }

  if (
    summary.stoppedReason === "completed" &&
    summary.cellsVerified === 0 &&
    summary.cellsFailed > 0
  ) {
    summary.stoppedReason = "error";
    summary.error = `${summary.cellsFailed}/${summary.cellsProcessed} rows failed, 0 checked, last error: ${summary.lastError}`;
  }

  await logProgress(hooks);
  hooks.onProgress(
    `[verify-translations] DONE (${summary.stoppedReason}) | ${summary.cellsProcessed} rows | ` +
      `${summary.callsUsed} calls | $${summary.costUsd.toFixed(2)} | checked=${summary.cellsVerified} ` +
      `flagged=${summary.rowsFlagged} fail=${summary.cellsFailed}`
  );
  return summary;
}

/** What the shared key-rotation loop (connection-verify-loop.ts) needs to drive this job. */
export const TRANSLATIONS_VARIANT: VerifyLoopVariant = {
  run: runTranslationVerifyBatch,
  allDone: (agg) =>
    `ALL DONE: every active translation (tr, ru, az) has been checked against its English. ` +
    `${agg.rowsFlagged} translation(s) were flagged for review (Admin > Connections, "pending"); ` +
    `users see the English reason for those`,
};
