import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockClaudeCreate, mockGeminiGenerate, mockGetFlagString } = vi.hoisted(() => ({
  mockClaudeCreate: vi.fn(),
  mockGeminiGenerate: vi.fn(),
  mockGetFlagString: vi.fn(),
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: mockClaudeCreate };
  },
}));

vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel() {
      return { generateContent: mockGeminiGenerate };
    }
  },
}));

vi.mock("@/lib/admin/feature-flags", () => ({ getFlagString: mockGetFlagString }));

import { callAI, callAIDetailed } from "@/lib/ai/ai";

function claudeReply(text: string, input = 10, output = 5) {
  return {
    content: [{ type: "text", text }],
    usage: { input_tokens: input, output_tokens: output },
  };
}

function geminiReply(text: string, meta: unknown) {
  return { response: { text: () => text, usageMetadata: meta } };
}

describe("provider resolution", () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    mockClaudeCreate.mockReset().mockResolvedValue(claudeReply("claude-said"));
    mockGeminiGenerate.mockReset().mockResolvedValue(geminiReply("gemini-said", null));
    // Default: no flag set (fall through to env / built-in default).
    mockGetFlagString.mockReset().mockImplementation((_key: string, fallback: string) => fallback);
    process.env = { ...savedEnv };
    delete process.env.AI_PROVIDER;
    delete process.env.AI_PROVIDER_CONNECTIONS;
    delete process.env.AI_PROVIDER_NAMES;
    process.env.GEMINI_API_KEY = "test-gemini-key";
  });

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it("defaults to claude when nothing is configured", async () => {
    const text = await callAI("hi");
    expect(text).toBe("claude-said");
    expect(mockGeminiGenerate).not.toHaveBeenCalled();
  });

  it("honours an explicit provider override above every flag/env", async () => {
    process.env.AI_PROVIDER = "claude";
    mockGetFlagString.mockImplementation((key: string, fallback: string) =>
      key === "ai_provider" ? "claude" : fallback
    );
    const res = await callAIDetailed("hi", { provider: "gemini" });
    expect(res.provider).toBe("gemini");
    expect(res.text).toBe("gemini-said");
  });

  it("uses the per-feature flag when set, independent of the global flag", async () => {
    mockGetFlagString.mockImplementation((key: string, fallback: string) => {
      if (key === "ai_provider_names") return "gemini";
      if (key === "ai_provider") return "claude";
      return fallback;
    });

    const names = await callAIDetailed("hi", { feature: "names" });
    expect(names.provider).toBe("gemini");

    const connections = await callAIDetailed("hi", { feature: "connections" });
    expect(connections.provider).toBe("claude");
  });

  it("falls back to the per-feature env var when no per-feature flag is set", async () => {
    process.env.AI_PROVIDER_CONNECTIONS = "gemini";
    const res = await callAIDetailed("hi", { feature: "connections" });
    expect(res.provider).toBe("gemini");
  });

  it("falls back to the legacy ai_provider flag for an untagged call", async () => {
    mockGetFlagString.mockImplementation((key: string, fallback: string) =>
      key === "ai_provider" ? "gemini" : fallback
    );
    const res = await callAIDetailed("hi");
    expect(res.provider).toBe("gemini");
  });

  it("the legacy ai_provider flag also covers a feature-tagged call with no per-feature override", async () => {
    mockGetFlagString.mockImplementation((key: string, fallback: string) =>
      key === "ai_provider" ? "gemini" : fallback
    );
    const res = await callAIDetailed("hi", { feature: "connections" });
    expect(res.provider).toBe("gemini");
  });

  it("parses Claude token usage", async () => {
    mockClaudeCreate.mockResolvedValue(claudeReply("x", 111, 22));
    const res = await callAIDetailed("hi");
    expect(res.usage).toEqual({ inputTokens: 111, outputTokens: 22 });
    expect(res.model).toBe("claude-opus-4-7");
  });

  it("parses Gemini token usage and tolerates a missing usageMetadata", async () => {
    mockGeminiGenerate.mockResolvedValue(
      geminiReply("x", { promptTokenCount: 40, candidatesTokenCount: 8 })
    );
    const withMeta = await callAIDetailed("hi", { provider: "gemini" });
    expect(withMeta.usage).toEqual({ inputTokens: 40, outputTokens: 8 });

    mockGeminiGenerate.mockResolvedValue(geminiReply("x", undefined));
    const noMeta = await callAIDetailed("hi", { provider: "gemini" });
    expect(noMeta.usage).toBeNull();
  });
});
