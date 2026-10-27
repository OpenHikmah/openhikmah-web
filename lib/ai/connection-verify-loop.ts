import {
  runVerifyBatch,
  type VerifyOptions,
  type VerifySummary,
} from "@/lib/ai/connection-verify-batch";
import type { BatchHooks } from "@/lib/ai/connection-batch";
import {
  newRotationSummary,
  runKeyRotation,
  type KeyRotationOptions,
  type KeyRotationSummary,
} from "@/lib/ai/key-rotation";

/**
 * The re-verification job's "loop mode", the same idea as the backfill loop
 * (`connection-batch-loop.ts`, on the shared driver in `key-rotation.ts`): run `runVerifyBatch` on a pool of free-tier
 * Gemini keys, one at a time, so the whole backlog is verified at zero budget
 * without anyone babysitting daily quotas.
 *
 * A pass that ends "quota-daily" (the key is spent for the day), "key-invalid"
 * or "rate-limited" (a per-minute 429 that survived the retries) rotates to the
 * next key. The loop stops when:
 *   - a pass finds nothing left to verify              → "work-exhausted" (ALL DONE)
 *   - every selected key is spent / invalid / limited  → "all-keys-daily"
 *   - the admin clicks Stop                            → "cancelled"
 *   - an optional safety budget cap is reached         → "call-budget" / "cost-budget"
 *   - a pass fails for a non-quota reason (provider down, malformed replies
 *     tripping the batch's fail-fast): do NOT rotate, the same fault would hit
 *     every key                                        → "error"
 *
 * Unlike the generation backfill there is no "unproductive pass" heuristic: a
 * `completed` verify pass processes its whole work list (verified cells drop
 * out of it), so the next pass sees only the cells that failed, and an empty
 * work list is the unambiguous finish.
 */

export type VerifyLoopOptions = KeyRotationOptions;

export interface VerifyLoopSummary extends KeyRotationSummary {
  /** Cells whose verification completed over the whole run. */
  cellsVerified: number;
  /** English connection rows flagged for review over the whole run. */
  rowsFlagged: number;
}

/**
 * What differs between the jobs this loop drives: the pass it runs and what
 * "ALL DONE" says. The default is the English connection re-verification; the
 * translation re-check passes its own (see translation-verify-batch.ts).
 */
export interface VerifyLoopVariant {
  run: (opts: VerifyOptions, hooks: BatchHooks, signal?: AbortSignal) => Promise<VerifySummary>;
  /** The ALL DONE line, given the totals so far. */
  allDone: (agg: VerifyLoopSummary) => string;
}

export const CONNECTIONS_VARIANT: VerifyLoopVariant = {
  run: (opts, hooks, signal) => runVerifyBatch(opts, hooks, signal),
  allDone: (agg) =>
    `ALL DONE: every active English connection has been verified. ` +
    `${agg.rowsFlagged} connection(s) were flagged for review (Admin > Connections, "pending")`,
};

/** Defensive ceiling per key. A completed pass handles the whole work list, so
 *  this is only reachable if something keeps failing without ever erroring out. */
const MAX_PASSES_PER_KEY = 50;

export function runVerifyLoop(
  opts: VerifyLoopOptions,
  hooks: BatchHooks,
  signal: AbortSignal,
  variant: VerifyLoopVariant = CONNECTIONS_VARIANT
): Promise<VerifyLoopSummary> {
  const agg: VerifyLoopSummary = { ...newRotationSummary(), cellsVerified: 0, rowsFlagged: 0 };

  const n = opts.apiKeys.length;
  hooks.onProgress(
    `[verify-loop] ${n} key(s): ${opts.apiKeyLabels.join(", ")} | model=${opts.model ?? "default"} | ` +
      `delay=${opts.callDelayMs}ms | maxCalls=${Number.isFinite(opts.maxCalls) ? opts.maxCalls : "∞"} | ` +
      `maxCost=${Number.isFinite(opts.maxCostUsd) ? `$${opts.maxCostUsd}` : "∞"}`
  );

  return runKeyRotation<VerifyLoopSummary, VerifySummary>(
    opts,
    agg,
    {
      prefix: "[verify-loop]",
      maxPassesPerKey: MAX_PASSES_PER_KEY,
      allKeysSpentNote: "Not finished: start the job again later and it continues where it stopped",
      runPass: (apiKey, budget, passHooks) =>
        variant.run(
          {
            provider: "gemini",
            model: opts.model,
            apiKey,
            callDelayMs: opts.callDelayMs,
            maxCalls: budget.maxCalls,
            maxCostUsd: budget.maxCostUsd,
          },
          passHooks,
          signal
        ),
      mergeCounters: (a, pass) => {
        a.cellsVerified += pass.cellsVerified;
        a.rowsFlagged += pass.rowsFlagged;
      },
      onCompleted: (a, pass, label, log) => {
        if (pass.workListSize === 0) {
          a.stoppedReason = "work-exhausted";
          return true;
        }
        log(
          `pass ${a.passes} done (verified=${pass.cellsVerified} flagged=${pass.rowsFlagged} ` +
            `fail=${pass.cellsFailed}), checking for anything left on ${label}`
        );
        return false;
      },
      describeCounters: (a) =>
        `verified=${a.cellsVerified} flagged=${a.rowsFlagged} fail=${a.cellsFailed}`,
      onFinish: (a, log) => {
        if (a.stoppedReason === "work-exhausted") log(variant.allDone(a));
      },
    },
    hooks,
    signal
  );
}
