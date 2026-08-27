import { describe, it, expect } from "vitest";
import { estimateCostUsd, DEFAULT_TOKENS } from "@/lib/ai/ai-cost";

describe("estimateCostUsd", () => {
  it("computes exact cost from real usage for a known model", () => {
    // claude-opus-4-7: $5/M in, $25/M out
    const cost = estimateCostUsd("claude-opus-4-7", "claude", {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(30, 6);
  });

  it("uses the cheap Gemini rate for a known Gemini model", () => {
    // gemini-2.0-flash: $0.10/M in, $0.40/M out
    const cost = estimateCostUsd("gemini-2.0-flash", "gemini", {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(0.5, 6);
  });

  it("falls back to the provider rate for an unknown model", () => {
    const known = estimateCostUsd("claude-opus-4-7", "claude", {
      inputTokens: 2000,
      outputTokens: 500,
    });
    const unknown = estimateCostUsd("some-future-claude", "claude", {
      inputTokens: 2000,
      outputTokens: 500,
    });
    expect(unknown).toBeCloseTo(known, 10);
  });

  it("uses DEFAULT_TOKENS when usage is null", () => {
    const withNull = estimateCostUsd("claude-opus-4-7", "claude", null);
    const explicit = estimateCostUsd("claude-opus-4-7", "claude", DEFAULT_TOKENS);
    expect(withNull).toBeCloseTo(explicit, 10);
    expect(withNull).toBeGreaterThan(0);
  });

  it("handles a null model by using the provider fallback rate", () => {
    const cost = estimateCostUsd(null, "gemini", { inputTokens: 1_000_000, outputTokens: 0 });
    // gemini fallback: $1.25/M in
    expect(cost).toBeCloseTo(1.25, 6);
  });
});
