import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getFlagString } from "@/lib/admin/feature-flags";

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
  /** Which feature is calling — selects a per-feature provider flag/env when set. */
  feature?: AiFeature;
  /** Hard provider override (e.g. the admin batch job's per-run pick). Wins over
   *  every flag and env var. */
  provider?: Provider;
}

const ENV_PROVIDER = (process.env.AI_PROVIDER ?? "claude") as Provider;

/** The model id a provider will use by default (respecting the model env vars). */
export function defaultModelFor(provider: Provider): string {
  return provider === "gemini"
    ? (process.env.GEMINI_MODEL ?? "gemini-2.0-flash")
    : (process.env.ANTHROPIC_MODEL ?? "claude-opus-4-7");
}

function asProvider(value: string | undefined): Provider | null {
  return value === "claude" || value === "gemini" ? value : null;
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
async function resolveProvider(feature?: AiFeature, override?: Provider): Promise<Provider> {
  const fromOverride = asProvider(override);
  if (fromOverride) return fromOverride;

  if (feature) {
    const fromFeatureFlag = asProvider(await getFlagString(`ai_provider_${feature}`, ""));
    if (fromFeatureFlag) return fromFeatureFlag;
    const fromFeatureEnv = asProvider(process.env[`AI_PROVIDER_${feature.toUpperCase()}`]);
    if (fromFeatureEnv) return fromFeatureEnv;
  }

  const flagged = await getFlagString("ai_provider", ENV_PROVIDER);
  return flagged === "gemini" ? "gemini" : "claude";
}

/**
 * Calls the configured LLM provider and returns the response text plus the
 * token usage, resolved provider, and model id. Prefer this over `callAI` when
 * you need to log spend or thread a provider override.
 */
export async function callAIDetailed(prompt: string, opts: CallAiOptions = {}): Promise<AiResult> {
  const provider = await resolveProvider(opts.feature, opts.provider);
  return provider === "gemini" ? callGemini(prompt) : callClaude(prompt);
}

/**
 * Calls the configured LLM provider and returns the raw text response.
 * Provider is selected per {@link resolveProvider}. Backwards-compatible thin
 * wrapper over {@link callAIDetailed}.
 */
export async function callAI(prompt: string, opts: CallAiOptions = {}): Promise<string> {
  return (await callAIDetailed(prompt, opts)).text;
}

async function callClaude(prompt: string): Promise<AiResult> {
  const client = new Anthropic();
  const model = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-7";
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

async function callGemini(prompt: string): Promise<AiResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  const model = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
  const ai = new GoogleGenerativeAI(apiKey);
  const genModel = ai.getGenerativeModel({ model });
  const result = await genModel.generateContent(prompt);
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
