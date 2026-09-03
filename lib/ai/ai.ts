import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getFlagString } from "@/lib/admin/feature-flags";
import { DEFAULT_MODEL, isModelForProvider } from "@/lib/ai/models";
import {
  AMBIGUOUS_429_ESCALATE_AFTER,
  GeminiDailyQuotaError,
  GeminiKeyInvalidError,
  GeminiRateLimitError,
  PER_MINUTE_MAX_RETRIES,
  classifyGeminiError,
  perMinuteBackoffMs,
} from "@/lib/ai/gemini-errors";
import { interruptibleSleep } from "@/lib/infra/sleep";

export type Provider = "claude" | "gemini";

/** The distinct LLM-backed features that can be pointed at different providers. */
export type AiFeature = "connections" | "names";

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface AiResult {
  text: string;
  /** Token usage reported by the provider, or null when it wasn't returned. */
  usage: AiUsage | null;
  provider: Provider;
  model: string;
}

export interface CallAiOptions {
  /** Which feature is calling — selects a per-feature provider/model flag/env when set. */
  feature?: AiFeature;
  /** Hard provider override (e.g. the admin batch job's per-run pick). Wins over
   *  every flag and env var. */
  provider?: Provider;
  /** Hard model override (the admin batch job's per-run pick). Applied only when
   *  it belongs to the resolved provider; otherwise ignored. */
  model?: string;
  /** Explicit Gemini API key for this call — the admin backfill loop's per-key
   *  pick. When set, overrides `process.env.GEMINI_API_KEY`. Ignored for Claude. */
  apiKey?: string;
  /** Cooperative-cancel signal. Currently only Gemini honours it, to abort a
   *  rate-limit backoff wait mid-sleep when the admin stops the job. */
  signal?: AbortSignal;
}

/** The model id a provider will use by default: the `<PROVIDER>_MODEL` env var
 *  if set (operator escape hatch), else the built-in default. */
export function defaultModelFor(provider: Provider): string {
  return provider === "gemini"
    ? (process.env.GEMINI_MODEL ?? DEFAULT_MODEL.gemini)
    : (process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL.claude);
}

function asProvider(value: string | undefined): Provider | null {
  return value === "claude" || value === "gemini" ? value : null;
}

/**
 * Resolves the model for a call, given its already-resolved provider. Precedence
 * (first hit that is a valid model for `provider` wins):
 *   1. `override` argument (the batch job's per-run pick)
 *   2. `ai_model_<feature>` admin flag
 *   3. `AI_MODEL_<FEATURE>` env var
 *   4. `ai_model` admin flag
 *   5. `defaultModelFor(provider)` — `<PROVIDER>_MODEL` env, else built-in default
 *
 * Admin-set candidates (flags/env) are checked against the provider's selectable
 * set so a leftover Claude model never gets sent to the Gemini API (or vice
 * versa) when the provider is switched. Step 5 is the operator escape hatch and
 * is trusted as-is.
 */
export async function resolveModel(
  feature: AiFeature | undefined,
  provider: Provider,
  override?: string
): Promise<string> {
  const validFor = (m: string | undefined | null): string | null =>
    m && isModelForProvider(m, provider) ? m : null;

  const fromOverride = validFor(override);
  if (fromOverride) return fromOverride;

  if (feature) {
    const fromFeatureFlag = validFor(await getFlagString(`ai_model_${feature}`, ""));
    if (fromFeatureFlag) return fromFeatureFlag;
    const fromFeatureEnv = validFor(process.env[`AI_MODEL_${feature.toUpperCase()}`]);
    if (fromFeatureEnv) return fromFeatureEnv;
  }

  const fromGlobalFlag = validFor(await getFlagString("ai_model", ""));
  if (fromGlobalFlag) return fromGlobalFlag;

  return defaultModelFor(provider);
}

/**
 * Resolves the active provider. Precedence (first hit wins):
 *   1. `override` argument
 *   2. `ai_provider_<feature>` admin flag
 *   3. `AI_PROVIDER_<FEATURE>` env var
 *   4. `ai_provider` admin flag, else `AI_PROVIDER` env, else "claude"
 *
 * Step 4 is the pre-existing global resolution, untouched — with no per-feature
 * flag or env set, the result is identical to before.
 */
export async function resolveProvider(feature?: AiFeature, override?: Provider): Promise<Provider> {
  const fromOverride = asProvider(override);
  if (fromOverride) return fromOverride;

  if (feature) {
    const fromFeatureFlag = asProvider(await getFlagString(`ai_provider_${feature}`, ""));
    if (fromFeatureFlag) return fromFeatureFlag;
    const fromFeatureEnv = asProvider(process.env[`AI_PROVIDER_${feature.toUpperCase()}`]);
    if (fromFeatureEnv) return fromFeatureEnv;
  }

  // Read AI_PROVIDER at call time (not a module-load snapshot) so tests and
  // runtime config changes take effect without a reload.
  const envProvider = (process.env.AI_PROVIDER ?? "claude") as Provider;
  const flagged = await getFlagString("ai_provider", envProvider);
  return flagged === "gemini" ? "gemini" : "claude";
}

/**
 * Calls the configured LLM provider and returns the response text plus the
 * token usage, resolved provider, and model id. Prefer this over `callAI` when
 * you need to log spend or thread a provider override.
 */
export async function callAIDetailed(prompt: string, opts: CallAiOptions = {}): Promise<AiResult> {
  const provider = await resolveProvider(opts.feature, opts.provider);
  const model = await resolveModel(opts.feature, provider, opts.model);
  return provider === "gemini"
    ? callGemini(prompt, model, opts.apiKey, opts.signal)
    : callClaude(prompt, model);
}

/**
 * Calls the configured LLM provider and returns the raw text response.
 * Provider is selected per {@link resolveProvider}. Backwards-compatible thin
 * wrapper over {@link callAIDetailed}.
 */
export async function callAI(prompt: string, opts: CallAiOptions = {}): Promise<string> {
  return (await callAIDetailed(prompt, opts)).text;
}

async function callClaude(prompt: string, model: string): Promise<AiResult> {
  const client = new Anthropic();
  const message = await client.messages.create({
    model,
    max_tokens: 4096,
    thinking: { type: "adaptive" },
    messages: [{ role: "user", content: prompt }],
  });
  const block = message.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new Error("No text block in Claude response");
  return {
    text: block.text,
    usage: message.usage
      ? {
          inputTokens: message.usage.input_tokens,
          outputTokens: message.usage.output_tokens,
        }
      : null,
    provider: "claude",
    model,
  };
}

/**
 * Consecutive ambiguous 429s (429 with no clear per-day / per-minute marker) per
 * API key, with no successful call on that key in between. Keyed by the key value
 * so the admin backfill loop's pool keys and live site traffic (which uses
 * `process.env.GEMINI_API_KEY`) never reset or trip each other's counter. Reset
 * on any success for that key and by `resetGeminiRateLimitState(key)` (the loop
 * calls it when it switches keys). At `AMBIGUOUS_429_ESCALATE_AFTER` a
 * `callGemini` throws `GeminiDailyQuotaError` so a daily-dead key that only emits
 * shapeless 429s still triggers a key rotation instead of retrying forever.
 */
const ambiguous429Streak = new Map<string, number>();

/** Clears the ambiguous-429 streak for one key, or all keys when omitted. */
export function resetGeminiRateLimitState(key?: string): void {
  if (key === undefined) ambiguous429Streak.clear();
  else ambiguous429Streak.delete(key);
}

async function callGemini(
  prompt: string,
  model: string,
  apiKey?: string,
  signal?: AbortSignal
): Promise<AiResult> {
  const key = apiKey ?? process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  const ai = new GoogleGenerativeAI(key);
  const genModel = ai.getGenerativeModel({ model });

  for (let attempt = 1; ; attempt++) {
    try {
      // `signal` aborts the client-side wait on a Stop click; it does not cancel
      // the request in Google's service (still billed) — SDK docs are explicit.
      const result = await genModel.generateContent(prompt, signal ? { signal } : {});
      ambiguous429Streak.delete(key);
      const meta = result.response.usageMetadata;
      return {
        text: result.response.text(),
        usage: meta
          ? {
              inputTokens: meta.promptTokenCount ?? 0,
              outputTokens: meta.candidatesTokenCount ?? 0,
            }
          : null,
        provider: "gemini",
        model,
      };
    } catch (err) {
      if (err instanceof GeminiDailyQuotaError || err instanceof GeminiKeyInvalidError) throw err;
      const info = classifyGeminiError(err);
      if (info.cls === "not-rate-limit") throw err;
      if (info.cls === "key-invalid") throw new GeminiKeyInvalidError(info);
      if (info.cls === "daily") throw new GeminiDailyQuotaError(info);

      if (info.cls === "other-429") {
        const streak = (ambiguous429Streak.get(key) ?? 0) + 1;
        ambiguous429Streak.set(key, streak);
        if (streak >= AMBIGUOUS_429_ESCALATE_AFTER) {
          ambiguous429Streak.delete(key);
          throw new GeminiDailyQuotaError(info);
        }
      }
      if (attempt >= PER_MINUTE_MAX_RETRIES) throw new GeminiRateLimitError(info, attempt);
      await interruptibleSleep(perMinuteBackoffMs(attempt, info.retryAfterMs), signal);
    }
  }
}

// ─── Embeddings ───────────────────────────────────────────────────────────────
// Anthropic has no embeddings API, so embeddings are always Gemini regardless of
// AI_PROVIDER. We hit the REST endpoint directly (not the SDK) so we can pass
// `outputDimensionality`: gemini-embedding-001 is natively 3072-dim, reduced here
// to 768 to match the verse_embeddings vector(768) column and its pgvector HNSW
// index (which caps at 2000 dims). The query and corpus must use the same model,
// so scripts/embed-corpus.mjs mirrors this exactly.

export const EMBEDDING_DIMENSIONS = 768;
const EMBEDDING_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

function embeddingModelName(): string {
  return process.env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-001";
}

async function embedViaRest(texts: string[], signal?: AbortSignal): Promise<number[][]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  const model = embeddingModelName();
  const res = await fetch(
    `${EMBEDDING_API_BASE}/models/${model}:batchEmbedContents?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: texts.map((text) => ({
          model: `models/${model}`,
          content: { parts: [{ text }] },
          outputDimensionality: EMBEDDING_DIMENSIONS,
        })),
      }),
      signal,
    }
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Embedding request failed: ${res.status} ${detail}`);
  }
  const data = (await res.json()) as { embeddings?: Array<{ values: number[] }> };
  if (!data.embeddings || data.embeddings.length !== texts.length) {
    throw new Error(
      `Embedding response missing embeddings: expected ${texts.length}, got ${data.embeddings?.length ?? 0}`
    );
  }
  return data.embeddings.map((e, i) => {
    if (!e.values || e.values.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(
        `Embedding ${i} has invalid shape: expected ${EMBEDDING_DIMENSIONS} dims, got ${e.values?.length ?? 0}`
      );
    }
    return e.values;
  });
}

/** Embeds a single piece of text into a fixed-length semantic vector. */
export async function embed(text: string, signal?: AbortSignal): Promise<number[]> {
  const [vector] = await embedViaRest([text], signal);
  if (!vector) throw new Error("No embedding returned");
  return vector;
}

/** Embeds many texts in one request, preserving input order. */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  return embedViaRest(texts);
}

/** The model identifier persisted alongside each stored embedding. */
export function embeddingModel(): string {
  return embeddingModelName();
}
