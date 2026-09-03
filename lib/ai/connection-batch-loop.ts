import { resetGeminiRateLimitState } from "@/lib/ai/ai";
import {
  runConnectionBatch,
  type BatchHooks,
  type BatchMode,
  type BatchSummary,
} from "@/lib/ai/connection-batch";
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
 * Per-minute 429s never reach here: `callGemini` waits them out and retries.
 */

export interface LoopOptions {
  mode: BatchMode;
  /** Gemini model id, or undefined for the resolved default. */
  model?: string;
  locales: Locale[];
  /** Key VALUES, in rotation order. Non-empty. */
  apiKeys: string[];
  /** Parallel labels ("GEMINI_API2") for the job log — never the values. */
  apiKeyLabels: string[];
  /** Delay between LLM calls, ms. */
  callDelayMs: number;
  /** Optional safety ceilings across the whole loop. `Number.POSITIVE_INFINITY`
   *  when the admin left the field blank. */
  maxCalls: number;
  maxCostUsd: number;
}

export type LoopStoppedReason =
  "work-exhausted" | "all-keys-daily" | "call-budget" | "cost-budget" | "cancelled" | "error";

export interface LoopSummary {
  stoppedReason: LoopStoppedReason;
  passes: number;
  keysUsed: number;
  /** Labels of keys that hit their daily quota this run. */
  keysExhausted: string[];
  cellsProcessed: number;
  callsUsed: number;
  costUsd: number;
  generated: number;
  translated: number;
  exhausted: number;
  cellsFailed: number;
  /** Whole-loop failure message (a non-quota pass error). Drives `job_runs.error`. */
  error?: string;
  lastError?: string;
}

/** Defensive ceiling: a single key that keeps returning "completed, work remains"
 *  without ever converging (should be impossible — every pass commits progress or
 *  is caught by the zero-progress guard) must not spin forever. */
const MAX_PASSES_PER_KEY = 5000;

function mergeCounters(agg: LoopSummary, pass: BatchSummary): void {
  agg.cellsProcessed += pass.cellsProcessed;
  agg.callsUsed += pass.callsUsed;
  agg.costUsd += pass.costUsd;
  agg.generated += pass.generated;
  agg.translated += pass.translated;
  agg.exhausted += pass.exhausted;
  agg.cellsFailed += pass.cellsFailed;
  if (pass.lastError) agg.lastError = pass.lastError;
}

function passChangedSomething(pass: BatchSummary): boolean {
  return pass.generated > 0 || pass.translated > 0 || pass.exhausted > 0 || pass.cellsFailed > 0;
}

export async function runConnectionBatchLoop(
  opts: LoopOptions,
  hooks: BatchHooks,
  signal: AbortSignal
): Promise<LoopSummary> {
  const agg: LoopSummary = {
    stoppedReason: "all-keys-daily",
    passes: 0,
    keysUsed: 0,
    keysExhausted: [],
    cellsProcessed: 0,
    callsUsed: 0,
    costUsd: 0,
    generated: 0,
    translated: 0,
    exhausted: 0,
    cellsFailed: 0,
  };

  const n = opts.apiKeys.length;
  hooks.onProgress(
    `[loop] ${opts.mode} | ${n} key(s): ${opts.apiKeyLabels.join(", ")} | ` +
      `model=${opts.model ?? "default"} | locales=${opts.locales.join(",") || "none"} | ` +
      `delay=${opts.callDelayMs}ms | ` +
      `maxCalls=${Number.isFinite(opts.maxCalls) ? opts.maxCalls : "∞"} | ` +
      `maxCost=${Number.isFinite(opts.maxCostUsd) ? `$${opts.maxCostUsd}` : "∞"}`
  );

  for (let k = 0; k < n; k++) {
    if (signal.aborted) {
      agg.stoppedReason = "cancelled";
      return finish(agg, hooks);
    }

    const label = opts.apiKeyLabels[k];
    agg.keysUsed = k + 1;
    hooks.onProgress(`[loop] key ${k + 1}/${n} (${label}) — starting`);
    // Per-key: the ambiguous-429 escalation counter in ai.ts is about "this key
    // looks daily-dead", so it must not carry over from the previous key.
    resetGeminiRateLimitState();

    let prevPassChanged = true;

    for (let p = 0; p < MAX_PASSES_PER_KEY; p++) {
      if (signal.aborted) {
        agg.stoppedReason = "cancelled";
        return finish(agg, hooks);
      }
      if (agg.callsUsed >= opts.maxCalls) {
        agg.stoppedReason = "call-budget";
        return finish(agg, hooks);
      }
      if (agg.costUsd >= opts.maxCostUsd) {
        agg.stoppedReason = "cost-budget";
        return finish(agg, hooks);
      }

      const pass = await runConnectionBatch(
        {
          mode: opts.mode,
          provider: "gemini",
          model: opts.model,
          locales: opts.locales,
          maxCalls: opts.maxCalls - agg.callsUsed,
          maxCostUsd: opts.maxCostUsd - agg.costUsd,
          apiKey: opts.apiKeys[k],
          callDelayMs: opts.callDelayMs,
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
            `[loop] key ${k + 1}/${n} (${label}) daily quota hit after ${agg.passes} pass(es) — rotating`
          );
          p = MAX_PASSES_PER_KEY; // break to next key
          continue;

        case "cancelled":
          agg.stoppedReason = "cancelled";
          return finish(agg, hooks);

        case "call-budget":
          agg.stoppedReason = "call-budget";
          return finish(agg, hooks);

        case "cost-budget":
          agg.stoppedReason = "cost-budget";
          return finish(agg, hooks);

        case "error":
          // Non-quota failure — every key would hit the same wall. Stop.
          agg.stoppedReason = "error";
          agg.error = pass.error;
          hooks.onProgress(`[loop] pass failed (${pass.error}) — stopping the loop`);
          return finish(agg, hooks);

        case "completed": {
          const changed = passChangedSomething(pass);
          if (!changed && !prevPassChanged) {
            // Two consecutive completed passes that changed nothing: the work
            // list has nothing left this mode can act on.
            agg.stoppedReason = "work-exhausted";
            hooks.onProgress(`[loop] ${opts.mode} work list fully covered — done`);
            return finish(agg, hooks);
          }
          if (!changed && pass.workListSize === 0) {
            agg.stoppedReason = "work-exhausted";
            hooks.onProgress(`[loop] ${opts.mode} work list empty — done`);
            return finish(agg, hooks);
          }
          prevPassChanged = changed;
          hooks.onProgress(
            `[loop] pass ${agg.passes} done (gen=${pass.generated} xlt=${pass.translated} ` +
              `exh=${pass.exhausted} fail=${pass.cellsFailed}) — work remains, continuing on ${label}`
          );
          continue;
        }
      }
    }
  }

  // Fell out of the key loop → every selected key hit its daily quota.
  agg.stoppedReason = "all-keys-daily";
  hooks.onProgress(`[loop] all ${n} selected key(s) exhausted for the day — stopping`);
  return finish(agg, hooks);
}

function finish(agg: LoopSummary, hooks: BatchHooks): LoopSummary {
  hooks.onProgress(
    `[loop] DONE (${agg.stoppedReason}) | ${agg.passes} pass(es) | ${agg.keysUsed} key(s) | ` +
      `${agg.callsUsed} calls | $${agg.costUsd.toFixed(2)} | ` +
      `gen=${agg.generated} xlt=${agg.translated} exh=${agg.exhausted} fail=${agg.cellsFailed}` +
      (agg.keysExhausted.length ? ` | exhausted: ${agg.keysExhausted.join(", ")}` : "")
  );
  return agg;
}
