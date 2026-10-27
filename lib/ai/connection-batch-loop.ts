import {
  runConnectionBatch,
  type BatchHooks,
  type BatchMode,
  type BatchSummary,
} from "@/lib/ai/connection-batch";
import {
  newRotationSummary,
  runKeyRotation,
  type KeyRotationOptions,
  type KeyRotationSummary,
} from "@/lib/ai/key-rotation";
import type { Locale } from "@/lib/i18n/config";

/**
 * The admin backfill "loop mode": run `runConnectionBatch` pass after pass on a
 * pool of free-tier Gemini keys, so the connection graph fills continuously at
 * zero budget.
 *
 * One key at a time. A pass that ends "quota-daily" means that key is spent for
 * the day → rotate to the next selected key. The loop stops only when:
 *   - every selected key has hit its daily quota          → "all-keys-daily"
 *   - the work list is fully covered (a completed pass     → "work-exhausted"
 *     that generated / translated / exhausted / failed nothing)
 *   - the admin clicks Stop (the job's AbortSignal)        → "cancelled"
 *   - an optional safety budget cap is reached             → "call-budget" / "cost-budget"
 *   - a pass fails for a non-quota reason (e.g. bad model, → "error"
 *     network, malformed responses tripping fail-fast) — do NOT rotate, the
 *     same fault would hit every key
 *
 * `callGemini` waits out and retries an ordinary per-minute 429, but a
 * sustained one that survives all those retries surfaces here as a
 * `GeminiRateLimitError` — that also rotates to the next key (issue #567 C1),
 * same as quota-daily/key-invalid, rather than counting toward the non-quota
 * "error" fail-fast path as if the provider itself were down.
 */

export interface LoopOptions extends KeyRotationOptions {
  mode: BatchMode;
  locales: Locale[];
}

export interface LoopSummary extends KeyRotationSummary {
  generated: number;
  translated: number;
  exhausted: number;
}

/** Defensive ceiling per key — the productivity guards below should always stop a
 *  key first; hitting this means something is wrong, so it ends the loop as an
 *  error, not a clean rotation. */
const MAX_PASSES_PER_KEY = 5000;
/** Consecutive `completed` passes that generated / translated / exhausted
 *  nothing AND failed nothing → the work list is genuinely done for this mode. */
const UNPRODUCTIVE_PASSES_BEFORE_DONE = 2;
/** Consecutive `completed` passes that produced nothing useful and DID fail
 *  cells → the model is misbehaving (e.g. mostly-malformed JSON) rather than the
 *  work being done. Stop the whole loop — the same fault will hit every key. */
const FAILING_PASSES_BEFORE_ABORT = 3;

/** A `completed` pass that actually moved the graph forward. `cellsFailed` is
 *  deliberately NOT progress — a pass that only fails cells must not keep the
 *  loop alive. */
function passWasProductive(pass: BatchSummary): boolean {
  return pass.generated > 0 || pass.translated > 0 || pass.exhausted > 0;
}

export function runConnectionBatchLoop(
  opts: LoopOptions,
  hooks: BatchHooks,
  signal: AbortSignal
): Promise<LoopSummary> {
  const agg: LoopSummary = { ...newRotationSummary(), generated: 0, translated: 0, exhausted: 0 };

  const n = opts.apiKeys.length;
  hooks.onProgress(
    `[loop] ${opts.mode} | ${n} key(s): ${opts.apiKeyLabels.join(", ")} | ` +
      `model=${opts.model ?? "default"} | locales=${opts.locales.join(",") || "none"} | ` +
      `delay=${opts.callDelayMs}ms | ` +
      `maxCalls=${Number.isFinite(opts.maxCalls) ? opts.maxCalls : "∞"} | ` +
      `maxCost=${Number.isFinite(opts.maxCostUsd) ? `$${opts.maxCostUsd}` : "∞"}`
  );

  let unproductivePasses = 0;
  let failingPasses = 0;

  return runKeyRotation<LoopSummary, BatchSummary>(
    opts,
    agg,
    {
      prefix: "[loop]",
      maxPassesPerKey: MAX_PASSES_PER_KEY,
      runPass: (apiKey, budget, passHooks) =>
        runConnectionBatch(
          {
            mode: opts.mode,
            provider: "gemini",
            model: opts.model,
            locales: opts.locales,
            maxCalls: budget.maxCalls,
            maxCostUsd: budget.maxCostUsd,
            apiKey,
            callDelayMs: opts.callDelayMs,
          },
          passHooks,
          signal
        ),
      mergeCounters: (a, pass) => {
        a.generated += pass.generated;
        a.translated += pass.translated;
        a.exhausted += pass.exhausted;
      },
      onKeyStart: () => {
        unproductivePasses = 0;
        failingPasses = 0;
      },
      onCompleted: (a, pass, label, log) => {
        if (passWasProductive(pass)) {
          unproductivePasses = 0;
          failingPasses = 0;
          log(
            `pass ${a.passes} done (gen=${pass.generated} xlt=${pass.translated} ` +
              `exh=${pass.exhausted} fail=${pass.cellsFailed}) — work remains, continuing on ${label}`
          );
          return false;
        }
        // Nothing useful this pass.
        if (pass.workListSize === 0 || pass.cellsFailed === 0) {
          if (++unproductivePasses >= UNPRODUCTIVE_PASSES_BEFORE_DONE || pass.workListSize === 0) {
            a.stoppedReason = "work-exhausted";
            log(`${opts.mode} work list fully covered — done`);
            return true;
          }
        } else if (++failingPasses >= FAILING_PASSES_BEFORE_ABORT) {
          a.stoppedReason = "error";
          a.error = `${failingPasses} consecutive passes generated nothing and only failed cells — last error: ${pass.lastError ?? "unknown"}`;
          log(`${a.error} — stopping the loop`);
          return true;
        }
        log(`pass ${a.passes} made no progress (fail=${pass.cellsFailed}) — retrying on ${label}`);
        return false;
      },
      describeCounters: (a) =>
        `gen=${a.generated} xlt=${a.translated} exh=${a.exhausted} fail=${a.cellsFailed}`,
    },
    hooks,
    signal
  );
}
