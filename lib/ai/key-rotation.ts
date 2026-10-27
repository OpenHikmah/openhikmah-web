import { resetGeminiRateLimitState } from "@/lib/ai/ai";
import type { BatchHooks, StoppedReason as PassStoppedReason } from "@/lib/ai/connection-batch";

/**
 * The key-rotation loop shared by the admin "loop mode" jobs (the connection
 * backfill and the re-verification). Each runs a batch pass on a pool of
 * free-tier Gemini keys, one key at a time: a pass that ends "quota-daily",
 * "key-invalid" or "rate-limited" rotates to the next key; a budget cap, a Stop
 * click or a non-quota failure ends the whole loop. What differs per job (the
 * pass it runs, which counters it keeps, what a `completed` pass means) is
 * supplied through `RotationJob`.
 */

export type LoopStoppedReason =
  "work-exhausted" | "all-keys-daily" | "call-budget" | "cost-budget" | "cancelled" | "error";

export interface KeyRotationOptions {
  /** Gemini model id, or undefined for the resolved default. */
  model?: string;
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

export interface KeyRotationSummary {
  stoppedReason: LoopStoppedReason;
  passes: number;
  keysUsed: number;
  /** Labels of keys that hit their daily quota this run. */
  keysExhausted: string[];
  /** Labels of keys that turned out to be invalid / revoked this run. */
  keysInvalid: string[];
  /** Labels of keys rotated away from after a sustained per-minute 429 (issue
   *  #567 C1) — not necessarily out for the day, just rate-limited right now. */
  keysRateLimited: string[];
  cellsProcessed: number;
  callsUsed: number;
  costUsd: number;
  cellsFailed: number;
  /** Whole-loop failure message (a non-quota pass error). Drives `job_runs.error`. */
  error?: string;
  lastError?: string;
}

/** The fields of a batch pass's summary that the driver itself reads. */
export interface RotationPass {
  stoppedReason: PassStoppedReason;
  cellsProcessed: number;
  callsUsed: number;
  costUsd: number;
  cellsFailed: number;
  error?: string;
  lastError?: string;
}

export function newRotationSummary(): KeyRotationSummary {
  return {
    stoppedReason: "all-keys-daily",
    passes: 0,
    keysUsed: 0,
    keysExhausted: [],
    keysInvalid: [],
    keysRateLimited: [],
    cellsProcessed: 0,
    callsUsed: 0,
    costUsd: 0,
    cellsFailed: 0,
  };
}

export interface RotationJob<S extends KeyRotationSummary, P extends RotationPass> {
  /** Log-line prefix, e.g. "[loop]". */
  prefix: string;
  /** Defensive ceiling per key. Hitting it ends the loop as an error. */
  maxPassesPerKey: number;
  /** Appended to the "every key spent" line, e.g. how to resume. */
  allKeysSpentNote?: string;
  /** Run one batch pass on `apiKey` within the remaining budget. */
  runPass: (
    apiKey: string,
    budget: { maxCalls: number; maxCostUsd: number },
    hooks: BatchHooks
  ) => Promise<P>;
  /** Fold the job-specific counters of `pass` into `agg`. */
  mergeCounters: (agg: S, pass: P) => void;
  /** Called when a fresh key starts, to reset per-key state. */
  onKeyStart?: () => void;
  /** Decide what a `completed` pass means. Return true to end the loop (having
   *  set `agg.stoppedReason`, and `agg.error` if it failed). */
  onCompleted: (agg: S, pass: P, label: string, log: (line: string) => void) => boolean;
  /** The job-specific totals on the closing DONE line. */
  describeCounters: (agg: S) => string;
  /** Extra lines logged before the DONE line, given the final summary. */
  onFinish?: (agg: S, log: (line: string) => void) => void;
}

export async function runKeyRotation<S extends KeyRotationSummary, P extends RotationPass>(
  opts: KeyRotationOptions,
  agg: S,
  job: RotationJob<S, P>,
  hooks: BatchHooks,
  signal: AbortSignal
): Promise<S> {
  const log = (line: string) => hooks.onProgress(`${job.prefix} ${line}`);
  const passHooks: BatchHooks = { onProgress: (line) => hooks.onProgress(`  ${line}`) };
  const n = opts.apiKeys.length;

  const finish = (): S => {
    job.onFinish?.(agg, log);
    log(
      `DONE (${agg.stoppedReason}) | ${agg.passes} pass(es) | ${agg.keysUsed} key(s) | ` +
        `${agg.callsUsed} calls | $${agg.costUsd.toFixed(2)} | ${job.describeCounters(agg)}` +
        (agg.keysExhausted.length ? ` | exhausted: ${agg.keysExhausted.join(", ")}` : "") +
        (agg.keysInvalid.length ? ` | invalid: ${agg.keysInvalid.join(", ")}` : "") +
        (agg.keysRateLimited.length ? ` | rate-limited: ${agg.keysRateLimited.join(", ")}` : "")
    );
    return agg;
  };

  for (let k = 0; k < n; k++) {
    if (signal.aborted) {
      agg.stoppedReason = "cancelled";
      return finish();
    }

    const label = opts.apiKeyLabels[k];
    const keyTag = `key ${k + 1}/${n} (${label})`;
    agg.keysUsed = k + 1;
    log(`${keyTag} — starting`);
    // Per-key: the ambiguous-429 escalation counter in ai.ts is keyed by the key
    // value, so clear THIS key's before we start (a redeploy or a previous run
    // could have left a stale count).
    resetGeminiRateLimitState(opts.apiKeys[k]);
    job.onKeyStart?.();

    let rotate = false;
    for (let p = 0; p < job.maxPassesPerKey && !rotate; p++) {
      if (signal.aborted) {
        agg.stoppedReason = "cancelled";
        return finish();
      }
      if (agg.callsUsed >= opts.maxCalls) {
        agg.stoppedReason = "call-budget";
        return finish();
      }
      if (agg.costUsd >= opts.maxCostUsd) {
        agg.stoppedReason = "cost-budget";
        return finish();
      }

      const pass = await job.runPass(
        opts.apiKeys[k],
        { maxCalls: opts.maxCalls - agg.callsUsed, maxCostUsd: opts.maxCostUsd - agg.costUsd },
        passHooks
      );
      agg.passes++;
      agg.cellsProcessed += pass.cellsProcessed;
      agg.callsUsed += pass.callsUsed;
      agg.costUsd += pass.costUsd;
      agg.cellsFailed += pass.cellsFailed;
      if (pass.lastError) agg.lastError = pass.lastError;
      job.mergeCounters(agg, pass);

      switch (pass.stoppedReason) {
        case "quota-daily":
          agg.keysExhausted.push(label);
          log(`${keyTag} daily quota hit after ${agg.passes} pass(es) — rotating`);
          rotate = true;
          break;

        case "key-invalid":
          // Per-key fault (revoked / invalid key) — rotate, don't stop.
          agg.keysInvalid.push(label);
          log(`${keyTag} invalid/blocked — rotating`);
          rotate = true;
          break;

        case "rate-limited":
          // A sustained per-minute 429 that survived callGemini's own retries
          // — not necessarily out for the day, but rotate rather than fail
          // fast as if the provider itself were down (issue #567 C1).
          agg.keysRateLimited.push(label);
          log(`${keyTag} rate-limited — rotating`);
          rotate = true;
          break;

        case "cancelled":
        case "call-budget":
        case "cost-budget":
          agg.stoppedReason = pass.stoppedReason;
          return finish();

        case "error":
          // Non-quota failure — every key would hit the same wall. Stop.
          agg.stoppedReason = "error";
          agg.error = pass.error;
          log(`pass failed (${pass.error}) — stopping the loop`);
          return finish();

        case "completed":
          if (job.onCompleted(agg, pass, label, log)) return finish();
          break;
      }
    }

    if (!rotate) {
      // Inner loop hit the per-key ceiling without converging or rotating — the
      // job's own guards should have caught this, so treat it as a bug.
      agg.stoppedReason = "error";
      agg.error = `key ${label} ran ${job.maxPassesPerKey} passes without converging`;
      log(`${agg.error} — stopping the loop`);
      return finish();
    }
  }

  // Fell out of the key loop → every key rotated (daily quota, invalid, and/or
  // rate-limited).
  if (agg.keysExhausted.length === 0) {
    // No key ever confirmed a real daily-quota hit — every rotation was
    // invalid/rate-limited, so labeling this "all-keys-daily" would be wrong.
    agg.stoppedReason = "error";
    agg.error = `all ${n} selected key(s) are invalid or rate-limited (none hit a daily quota)`;
    log(`${agg.error} — stopping the loop`);
    return finish();
  }
  agg.stoppedReason = "all-keys-daily";
  log(
    `all ${n} selected key(s) exhausted, invalid, or rate-limited — stopping` +
      (job.allKeysSpentNote ? `. ${job.allKeysSpentNote}` : "")
  );
  return finish();
}
