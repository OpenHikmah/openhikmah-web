import { resetGeminiRateLimitState } from "@/lib/ai/ai";
import {
  runVerifyBatch,
  type VerifyOptions,
  type VerifySummary,
} from "@/lib/ai/connection-verify-batch";
import type { BatchHooks } from "@/lib/ai/connection-batch";
import type { LoopStoppedReason } from "@/lib/ai/connection-batch-loop";

/**
 * The re-verification job's "loop mode", the same idea as the backfill loop
 * (`connection-batch-loop.ts`): run `runVerifyBatch` on a pool of free-tier
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

export interface VerifyLoopOptions {
  /** Gemini model id, or undefined for the resolved default. */
  model?: string;
  /** Key VALUES, in rotation order. Non-empty. */
  apiKeys: string[];
  /** Parallel labels ("GEMINI_API2") for the job log, never the values. */
  apiKeyLabels: string[];
  /** Delay between LLM calls, ms. */
  callDelayMs: number;
  /** Optional safety ceilings across the whole loop. `Number.POSITIVE_INFINITY`
   *  when the admin left the field blank. */
  maxCalls: number;
  maxCostUsd: number;
}

export interface VerifyLoopSummary {
  stoppedReason: LoopStoppedReason;
  passes: number;
  keysUsed: number;
  keysExhausted: string[];
  keysInvalid: string[];
  keysRateLimited: string[];
  cellsProcessed: number;
  callsUsed: number;
  costUsd: number;
  /** Cells whose verification completed over the whole run. */
  cellsVerified: number;
  /** English connection rows flagged for review over the whole run. */
  rowsFlagged: number;
  cellsFailed: number;
  error?: string;
  lastError?: string;
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

function mergeCounters(agg: VerifyLoopSummary, pass: VerifySummary): void {
  agg.cellsProcessed += pass.cellsProcessed;
  agg.callsUsed += pass.callsUsed;
  agg.costUsd += pass.costUsd;
  agg.cellsVerified += pass.cellsVerified;
  agg.rowsFlagged += pass.rowsFlagged;
  agg.cellsFailed += pass.cellsFailed;
  if (pass.lastError) agg.lastError = pass.lastError;
}

export async function runVerifyLoop(
  opts: VerifyLoopOptions,
  hooks: BatchHooks,
  signal: AbortSignal,
  variant: VerifyLoopVariant = CONNECTIONS_VARIANT
): Promise<VerifyLoopSummary> {
  const agg: VerifyLoopSummary = {
    stoppedReason: "all-keys-daily",
    passes: 0,
    keysUsed: 0,
    keysExhausted: [],
    keysInvalid: [],
    keysRateLimited: [],
    cellsProcessed: 0,
    callsUsed: 0,
    costUsd: 0,
    cellsVerified: 0,
    rowsFlagged: 0,
    cellsFailed: 0,
  };

  const n = opts.apiKeys.length;
  hooks.onProgress(
    `[verify-loop] ${n} key(s): ${opts.apiKeyLabels.join(", ")} | model=${opts.model ?? "default"} | ` +
      `delay=${opts.callDelayMs}ms | maxCalls=${Number.isFinite(opts.maxCalls) ? opts.maxCalls : "∞"} | ` +
      `maxCost=${Number.isFinite(opts.maxCostUsd) ? `$${opts.maxCostUsd}` : "∞"}`
  );

  for (let k = 0; k < n; k++) {
    if (signal.aborted) {
      agg.stoppedReason = "cancelled";
      return finish(agg, hooks, variant);
    }

    const label = opts.apiKeyLabels[k];
    agg.keysUsed = k + 1;
    hooks.onProgress(`[verify-loop] key ${k + 1}/${n} (${label}): starting`);
    // The ambiguous-429 escalation counter in ai.ts is keyed by the key value:
    // clear THIS key's before starting (a redeploy or earlier run may have left
    // a stale count).
    resetGeminiRateLimitState(opts.apiKeys[k]);

    let rotate = false;
    for (let p = 0; p < MAX_PASSES_PER_KEY && !rotate; p++) {
      if (signal.aborted) {
        agg.stoppedReason = "cancelled";
        return finish(agg, hooks, variant);
      }
      if (agg.callsUsed >= opts.maxCalls) {
        agg.stoppedReason = "call-budget";
        return finish(agg, hooks, variant);
      }
      if (agg.costUsd >= opts.maxCostUsd) {
        agg.stoppedReason = "cost-budget";
        return finish(agg, hooks, variant);
      }

      const pass = await variant.run(
        {
          provider: "gemini",
          model: opts.model,
          apiKey: opts.apiKeys[k],
          callDelayMs: opts.callDelayMs,
          maxCalls: opts.maxCalls - agg.callsUsed,
          maxCostUsd: opts.maxCostUsd - agg.costUsd,
        },
        { onProgress: (line) => hooks.onProgress(`  ${line}`) },
        signal
      );
      agg.passes++;
      mergeCounters(agg, pass);

      switch (pass.stoppedReason) {
        case "quota-daily":
          agg.keysExhausted.push(label);
          hooks.onProgress(
            `[verify-loop] key ${k + 1}/${n} (${label}) daily quota hit after ${agg.passes} pass(es), rotating`
          );
          rotate = true;
          break;

        case "key-invalid":
          agg.keysInvalid.push(label);
          hooks.onProgress(
            `[verify-loop] key ${k + 1}/${n} (${label}) invalid or blocked, rotating`
          );
          rotate = true;
          break;

        case "rate-limited":
          agg.keysRateLimited.push(label);
          hooks.onProgress(`[verify-loop] key ${k + 1}/${n} (${label}) rate-limited, rotating`);
          rotate = true;
          break;

        case "cancelled":
        case "call-budget":
        case "cost-budget":
          agg.stoppedReason = pass.stoppedReason;
          return finish(agg, hooks, variant);

        case "error":
          // Non-quota failure: every key would hit the same wall. Stop.
          agg.stoppedReason = "error";
          agg.error = pass.error;
          hooks.onProgress(`[verify-loop] pass failed (${pass.error}), stopping the loop`);
          return finish(agg, hooks, variant);

        case "completed":
          if (pass.workListSize === 0) {
            agg.stoppedReason = "work-exhausted";
            return finish(agg, hooks, variant);
          }
          hooks.onProgress(
            `[verify-loop] pass ${agg.passes} done (verified=${pass.cellsVerified} ` +
              `flagged=${pass.rowsFlagged} fail=${pass.cellsFailed}), checking for anything left on ${label}`
          );
          break;
      }
    }

    if (!rotate) {
      agg.stoppedReason = "error";
      agg.error = `key ${label} ran ${MAX_PASSES_PER_KEY} passes without converging`;
      hooks.onProgress(`[verify-loop] ${agg.error}, stopping the loop`);
      return finish(agg, hooks, variant);
    }
  }

  // Fell out of the key loop: every key rotated away.
  if (agg.keysExhausted.length === 0) {
    // No key confirmed a real daily-quota hit, so "all-keys-daily" would be wrong.
    agg.stoppedReason = "error";
    agg.error = `all ${n} selected key(s) are invalid or rate-limited (none hit a daily quota)`;
    hooks.onProgress(`[verify-loop] ${agg.error}, stopping the loop`);
    return finish(agg, hooks, variant);
  }
  agg.stoppedReason = "all-keys-daily";
  hooks.onProgress(
    `[verify-loop] all ${n} selected key(s) exhausted, invalid or rate-limited. Not finished: start the job again later and it continues where it stopped`
  );
  return finish(agg, hooks, variant);
}

function finish(
  agg: VerifyLoopSummary,
  hooks: BatchHooks,
  variant: VerifyLoopVariant
): VerifyLoopSummary {
  if (agg.stoppedReason === "work-exhausted") {
    hooks.onProgress(`[verify-loop] ${variant.allDone(agg)}`);
  }
  hooks.onProgress(
    `[verify-loop] DONE (${agg.stoppedReason}) | ${agg.passes} pass(es) | ${agg.keysUsed} key(s) | ` +
      `${agg.callsUsed} calls | $${agg.costUsd.toFixed(2)} | verified=${agg.cellsVerified} ` +
      `flagged=${agg.rowsFlagged} fail=${agg.cellsFailed}` +
      (agg.keysExhausted.length ? ` | exhausted: ${agg.keysExhausted.join(", ")}` : "") +
      (agg.keysInvalid.length ? ` | invalid: ${agg.keysInvalid.join(", ")}` : "") +
      (agg.keysRateLimited.length ? ` | rate-limited: ${agg.keysRateLimited.join(", ")}` : "")
  );
  return agg;
}
