import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";

type Provider = "claude" | "gemini";

const provider = (process.env.AI_PROVIDER ?? "claude") as Provider;

/**
 * Calls the configured LLM provider and returns the raw text response.
 * Provider is selected by AI_PROVIDER env var ("claude" | "gemini", default: "claude").
 */
export async function callAI(prompt: string): Promise<string> {
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
// AI_PROVIDER. Used to populate verse_embeddings (semantic search + grounded
// thematic/contrast discovery). The dimension must match the verse_embeddings
// vector(N) column in the schema.

export const EMBEDDING_DIMENSIONS = 768;

function embeddingModelName(): string {
  return process.env.GEMINI_EMBEDDING_MODEL ?? "text-embedding-004";
}

function embeddingClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  return new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: embeddingModelName() });
}

/** Embeds a single piece of text into a fixed-length semantic vector. */
export async function embed(text: string): Promise<number[]> {
  const { embedding } = await embeddingClient().embedContent(text);
  return embedding.values;
}

/** Embeds many texts in one request, preserving input order. */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const model = embeddingClient();
  const { embeddings } = await model.batchEmbedContents({
    requests: texts.map((text) => ({ content: { role: "user", parts: [{ text }] } })),
  });
  return embeddings.map((e) => e.values);
}

/** The model identifier persisted alongside each stored embedding. */
export function embeddingModel(): string {
  return embeddingModelName();
}
