import { describe, it, expect } from "vitest";
import { estimateCostUsd } from "@/lib/ai/ai-cost";
import { SELECTABLE_MODELS, DEFAULT_MODEL, isModelForProvider } from "@/lib/ai/models";

describe("SELECTABLE_MODELS", () => {
  it("every selectable model has a real (non-fallback) rate in ai-cost", () => {
    const usage = { inputTokens: 1_000_000, outputTokens: 1_000_000 };
    for (const provider of ["claude", "gemini"] as const) {
      const fallback = estimateCostUsd("definitely-not-a-model", provider, usage);
      for (const model of SELECTABLE_MODELS[provider]) {
        const known = estimateCostUsd(model, provider, usage);
        // A model with its own RATES entry is strictly cheaper than the
        // conservative provider fallback — if it were missing from RATES it
        // would resolve to the same (fallback) estimate and this would fail.
        expect(known).toBeLessThan(fallback);
        expect(known).toBeGreaterThan(0);
      }
    }
  });

  it("each provider's default is one of its selectable models", () => {
    expect(SELECTABLE_MODELS.claude).toContain(DEFAULT_MODEL.claude);
    expect(SELECTABLE_MODELS.gemini).toContain(DEFAULT_MODEL.gemini);
  });

  it("isModelForProvider rejects a cross-provider model", () => {
    expect(isModelForProvider("claude-opus-4-7", "claude")).toBe(true);
    expect(isModelForProvider("claude-opus-4-7", "gemini")).toBe(false);
    expect(isModelForProvider("gemini-3.5-flash-lite", "gemini")).toBe(true);
    expect(isModelForProvider("nonsense", "claude")).toBe(false);
  });
});
