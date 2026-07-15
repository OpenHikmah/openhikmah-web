import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getFlagString } from "@/lib/admin/feature-flags";

type Provider = "claude" | "gemini";

const ENV_PROVIDER = (process.env.AI_PROVIDER ?? "claude") as Provider;

/** Resolves the active provider: the `ai_provider` flag if set, else AI_PROVIDER env. */
async function resolveProvider(): Promise<Provider> {
  const flagged = await getFlagString("ai_provider", ENV_PROVIDER);
  return flagged === "gemini" ? "gemini" : "claude";
}

/**
 * Calls the configured LLM provider and returns the raw text response.
 * Provider is selected by the `ai_provider` admin flag, falling back to the
 * AI_PROVIDER env var ("claude" | "gemini", default: "claude") when unset.
 */
export async function callAI(prompt: string): Promise<string> {
  const provider = await resolveProvider();
  if (provider === "gemini") return callGemini(prompt);
  return callClaude(prompt);
}

async function callClaude(prompt: string): Promise<string> {
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
  return block.text;
}

async function callGemini(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  const model = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
  const ai = new GoogleGenerativeAI(apiKey);
  const genModel = ai.getGenerativeModel({ model });
  const result = await genModel.generateContent(prompt);
  return result.response.text();
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

async function embedViaRest(texts: string[]): Promise<number[][]> {
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
export async function embed(text: string): Promise<number[]> {
  const [vector] = await embedViaRest([text]);
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
