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
    // gemini-3.5-flash-lite: $0.30/M in, $2.50/M out
    const cost = estimateCostUsd("gemini-3.5-flash-lite", "gemini", {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(2.8, 6);
  });

  it("uses the exact Fable 5 rate for its model id", () => {
    // claude-fable-5: $10/M in, $50/M out — the exact entry, not the fallback.
    const cost = estimateCostUsd("claude-fable-5", "claude", {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(60, 6);
  });

  it("falls back to the provider's highest rate for an unknown model", () => {
    // Claude fallback = Fable 5 list price ($10/M in, $50/M out) so the spend
    // guard never under-estimates an unrecognised model id.
    const unknown = estimateCostUsd("some-future-claude", "claude", {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });
    expect(unknown).toBeCloseTo(60, 6);
    // ...which is strictly above a known cheaper model's cost for the same usage.
    const opus = estimateCostUsd("claude-opus-4-7", "claude", {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });
    expect(unknown).toBeGreaterThan(opus);
  });

  it("uses DEFAULT_TOKENS when usage is null", () => {
    const withNull = estimateCostUsd("claude-opus-4-7", "claude", null);
    const explicit = estimateCostUsd("claude-opus-4-7", "claude", DEFAULT_TOKENS);
    expect(withNull).toBeCloseTo(explicit, 10);
    expect(withNull).toBeGreaterThan(0);
  });

  it("handles a null model by using the provider fallback rate", () => {
    const cost = estimateCostUsd(null, "gemini", { inputTokens: 1_000_000, outputTokens: 0 });
    // gemini fallback: $1.50/M in
    expect(cost).toBeCloseTo(1.5, 6);
  });
});
