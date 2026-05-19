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
