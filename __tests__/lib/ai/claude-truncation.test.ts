import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: mockCreate };
  },
}));
vi.mock("@/lib/admin/feature-flags", () => ({
  getFlagString: vi.fn((_k: string, fallback: string) => fallback),
}));

import { AiTruncatedError, callAIDetailed } from "@/lib/ai/ai";

describe("callClaude truncation", () => {
  beforeEach(() => mockCreate.mockReset());

  it("throws AiTruncatedError when the response stopped at max_tokens", async () => {
    mockCreate.mockResolvedValueOnce({
      stop_reason: "max_tokens",
      content: [{ type: "text", text: "cut off mid-sen" }],
      usage: { input_tokens: 1, output_tokens: 4096 },
    });
    await expect(callAIDetailed("p", { provider: "claude" })).rejects.toBeInstanceOf(
      AiTruncatedError
    );
  });

  it("returns the text when the response ended normally", async () => {
    mockCreate.mockResolvedValueOnce({
      stop_reason: "end_turn",
      content: [{ type: "text", text: "done" }],
      usage: { input_tokens: 1, output_tokens: 2 },
    });
    const res = await callAIDetailed("p", { provider: "claude" });
    expect(res.text).toBe("done");
  });
});
