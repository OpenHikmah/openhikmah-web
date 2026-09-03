/**
 * The single place Gemini 429 / RESOURCE_EXHAUSTED errors are classified.
 *
 * The admin backfill "loop mode" (lib/ai/connection-batch-loop.ts) rotates through
 * a pool of free-tier Gemini keys. It must tell apart:
 *
 *   - a PER-DAY quota exhaustion  → that key is done until the quota resets;
 *                                   rotate to the next key.
 *   - a PER-MINUTE rate limit     → transient; wait out `retryDelay` and retry
 *                                   the same key.
 *
 * `@google/generative-ai@^0.24.1` is Google's legacy SDK. On a non-2xx it throws
 * `GoogleGenerativeAIFetchError` with `.status`, `.statusText`, and
 * `.errorDetails` (parsed `error.details[]`), and also stringifies the RPC error
 * into `.message`. The exact shape is not contractual, so the classifier reads
 * whatever is present and degrades to a conservative fallback (see
 * `classifyGeminiError`).
 */

/** Attempts before a per-minute retry loop gives up on a request. */
export const PER_MINUTE_MAX_RETRIES = 6;
/** Base wait between per-minute retries (doubled each attempt). Free-tier RPM
 *  windows are ~60s, so the first waits are deliberately long. */
export const PER_MINUTE_BASE_DELAY_MS = 20_000;
/** Ceiling for a single per-minute backoff wait. */
export const PER_MINUTE_MAX_DELAY_MS = 65_000;
/** Consecutive ambiguous 429s (429 with no clear per-day / per-minute marker) on
 *  one key, with no successful call in between, after which the key is assumed
 *  daily-exhausted and the loop rotates. Guards against a genuinely dead key that
 *  only emits shapeless 429s stalling the loop forever. */
export const AMBIGUOUS_429_ESCALATE_AFTER = 8;

export type GeminiRateClass = "daily" | "per-minute" | "other-429" | "not-rate-limit";

export interface GeminiRateInfo {
  cls: GeminiRateClass;
  status?: number;
  /** Parsed from the RPC `RetryInfo.retryDelay` ("39s") or a Retry-After header. */
  retryAfterMs?: number;
  /** The RPC `QuotaFailure` violation quotaId, when present. */
  quotaId?: string;
  /** A short slice of the underlying error, for the job log. */
  raw: string;
}

/** Thrown up through the generation call chain to signal the loop must rotate to
 *  the next key. Deliberately NOT caught as an ordinary per-cell failure by
 *  `runConnectionBatch`. */
export class GeminiDailyQuotaError extends Error {
  readonly info: GeminiRateInfo;
  constructor(info: GeminiRateInfo) {
    super(`Gemini daily quota exhausted${info.quotaId ? ` (${info.quotaId})` : ""}`);
    this.name = "GeminiDailyQuotaError";
    this.info = info;
  }
}

/** Thrown when a per-minute retry loop is exhausted. Treated by
 *  `runConnectionBatch` as an ordinary cell failure (run continues; fail-fast
 *  still applies). */
export class GeminiRateLimitError extends Error {
  readonly info: GeminiRateInfo;
  readonly attempts: number;
  constructor(info: GeminiRateInfo, attempts: number) {
    super(`Gemini rate limit not cleared after ${attempts} attempts`);
    this.name = "GeminiRateLimitError";
    this.info = info;
    this.attempts = attempts;
  }
}

interface FetchErrorLike {
  status?: number;
  statusText?: string;
  errorDetails?: unknown;
  message?: string;
}

function asFetchErrorLike(err: unknown): FetchErrorLike | null {
  if (typeof err !== "object" || err === null) return null;
  return err as FetchErrorLike;
}

function parseRetryAfterMs(text: string): number | undefined {
  const retryDelay = text.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/i);
  if (retryDelay) return Math.ceil(parseFloat(retryDelay[1]) * 1000);
  const retryAfter = text.match(/retry-?after["\s:]+(\d+)/i);
  if (retryAfter) return parseInt(retryAfter[1], 10) * 1000;
  return undefined;
}

/**
 * Classifies an error thrown by a Gemini `generateContent` call.
 *
 * Conservative fallback: an unrecognised 429 is `other-429`, which the retry
 * wrapper treats as per-minute (wait + retry). A misclassified per-minute error
 * that were treated as daily would burn a key permanently on a transient blip;
 * the reverse only wastes bounded, capped retry time. `AMBIGUOUS_429_ESCALATE_AFTER`
 * is the backstop for a truly daily-dead key that only emits `other-429`.
 */
export function classifyGeminiError(err: unknown): GeminiRateInfo {
  const e = asFetchErrorLike(err);
  const message = typeof e?.message === "string" ? e.message : "";
  const detailsJson = e?.errorDetails !== undefined ? safeStringify(e.errorDetails) : "";
  const status = typeof e?.status === "number" ? e.status : undefined;

  const signal = `${detailsJson}\n${message}`;
  const lower = signal.toLowerCase();
  const raw = signal.trim().slice(0, 500);

  // A concrete non-429 status is never a rate limit for our purposes — a 403
  // "Quota exceeded ... consumer suspended" or a 400 about a quota project
  // contain the word "quota" but must NOT route into the retry/rotate path
  // (they'd cost ~4 min of backoff per key and end the run as a false "success").
  if (status !== undefined && status !== 429) {
    return { cls: "not-rate-limit", status, raw };
  }

  const looksRateLimited =
    status === 429 ||
    lower.includes("resource_exhausted") ||
    lower.includes("too many requests") ||
    lower.includes("rate limit") ||
    lower.includes("quota");

  if (!looksRateLimited) {
    return { cls: "not-rate-limit", status, raw };
  }

  const retryAfterMs = parseRetryAfterMs(signal);
  const quotaId = signal.match(/"quotaId"\s*:\s*"([^"]+)"/)?.[1];

  const perDay =
    /per\s*day|perday|requests per day|generaterequestsperday/i.test(quotaId ?? "") ||
    /perdayper|requests per day|generaterequestsperday/i.test(lower);
  const perMinute =
    /per\s*minute|perminute|requests per minute/i.test(quotaId ?? "") ||
    /perminuteper|requests per minute|input tokens per model per minute|tokens per minute/i.test(
      lower
    );

  if (perDay) return { cls: "daily", status, retryAfterMs, quotaId, raw };
  if (perMinute) return { cls: "per-minute", status, retryAfterMs, quotaId, raw };
  return { cls: "other-429", status, retryAfterMs, quotaId, raw };
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** Smallest per-minute backoff wait, even when Google says `"retryDelay": "0s"`
 *  — retrying instantly 6× is how a key gets flagged. */
export const PER_MINUTE_MIN_DELAY_MS = 2_000;

/** The backoff wait for per-minute retry `attempt` (1-based), honouring an
 *  explicit `retryAfterMs` when Google sent a usable one, else exponential with
 *  jitter. Always at least `PER_MINUTE_MIN_DELAY_MS`. */
export function perMinuteBackoffMs(attempt: number, retryAfterMs?: number): number {
  const exponential = PER_MINUTE_BASE_DELAY_MS * Math.pow(2, Math.max(0, attempt - 1));
  const base = retryAfterMs && retryAfterMs > 0 ? retryAfterMs : exponential;
  const capped = Math.min(Math.max(base, PER_MINUTE_MIN_DELAY_MS), PER_MINUTE_MAX_DELAY_MS);
  const jitter = capped * (0.85 + Math.random() * 0.3);
  return Math.round(jitter);
}
