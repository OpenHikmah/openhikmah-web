import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRunConnectionBatch, mockReset } = vi.hoisted(() => ({
  mockRunConnectionBatch: vi.fn(),
  mockReset: vi.fn(),
}));
vi.mock("@/lib/ai/connection-batch", () => ({ runConnectionBatch: mockRunConnectionBatch }));
vi.mock("@/lib/ai/ai", () => ({ resetGeminiRateLimitState: mockReset }));

import { runConnectionBatchLoop, type LoopOptions } from "@/lib/ai/connection-batch-loop";

const ZERO = {
  cellsProcessed: 0,
  callsUsed: 0,
  costUsd: 0,
  generated: 0,
  translated: 0,
  exhausted: 0,
  cellsFailed: 0,
  workListSize: 10,
};
const pass = (over: Record<string, unknown>) => ({ ...ZERO, ...over });

function opts(over: Partial<LoopOptions> = {}): LoopOptions {
  return {
    mode: "baseline",
    locales: ["tr"],
    apiKeys: ["k1", "k2"],
    apiKeyLabels: ["GEMINI_API1", "GEMINI_API2"],
    callDelayMs: 0,
    maxCalls: Number.POSITIVE_INFINITY,
    maxCostUsd: Number.POSITIVE_INFINITY,
    ...over,
  };
}

const hooks = { onProgress: vi.fn() };

beforeEach(() => {
  mockRunConnectionBatch.mockReset();
  mockReset.mockReset();
  hooks.onProgress.mockReset();
});

describe("runConnectionBatchLoop", () => {
  it("rotates to the next key on quota-daily and uses that key's value", async () => {
    mockRunConnectionBatch
      .mockResolvedValueOnce(pass({ stoppedReason: "quota-daily", generated: 3 }))
      .mockResolvedValueOnce(pass({ stoppedReason: "completed" }))
      .mockResolvedValueOnce(pass({ stoppedReason: "completed" }));

    const summary = await runConnectionBatchLoop(opts(), hooks, new AbortController().signal);

    expect(mockRunConnectionBatch.mock.calls[0][0].apiKey).toBe("k1");
    expect(mockRunConnectionBatch.mock.calls[1][0].apiKey).toBe("k2");
    expect(summary.keysExhausted).toEqual(["GEMINI_API1"]);
    expect(summary.stoppedReason).toBe("work-exhausted");
    expect(mockReset).toHaveBeenCalledTimes(2);
  });

  it("ends all-keys-daily when every key hits its daily quota", async () => {
    mockRunConnectionBatch.mockResolvedValue(pass({ stoppedReason: "quota-daily" }));
    const summary = await runConnectionBatchLoop(opts(), hooks, new AbortController().signal);
    expect(summary.stoppedReason).toBe("all-keys-daily");
    expect(summary.keysExhausted).toEqual(["GEMINI_API1", "GEMINI_API2"]);
  });

  it("keeps looping the same key while a completed pass still makes progress", async () => {
    mockRunConnectionBatch
      .mockResolvedValueOnce(pass({ stoppedReason: "completed", generated: 5 }))
      .mockResolvedValueOnce(pass({ stoppedReason: "completed", generated: 2 }))
      .mockResolvedValueOnce(pass({ stoppedReason: "completed" }))
      .mockResolvedValueOnce(pass({ stoppedReason: "completed" }));

    const summary = await runConnectionBatchLoop(
      opts({ apiKeys: ["k1"], apiKeyLabels: ["GEMINI_API1"] }),
      hooks,
      new AbortController().signal
    );
    expect(summary.passes).toBe(4);
    expect(summary.generated).toBe(7);
    expect(summary.stoppedReason).toBe("work-exhausted");
  });

  it("stops the whole loop (no rotation) on a non-quota pass error", async () => {
    mockRunConnectionBatch.mockResolvedValueOnce(
      pass({ stoppedReason: "error", error: "provider likely down" })
    );
    const summary = await runConnectionBatchLoop(opts(), hooks, new AbortController().signal);
    expect(summary.stoppedReason).toBe("error");
    expect(summary.error).toBe("provider likely down");
    expect(mockRunConnectionBatch).toHaveBeenCalledTimes(1);
  });

  it("returns cancelled immediately for an already-aborted signal", async () => {
    const ac = new AbortController();
    ac.abort();
    const summary = await runConnectionBatchLoop(opts(), hooks, ac.signal);
    expect(summary.stoppedReason).toBe("cancelled");
    expect(mockRunConnectionBatch).not.toHaveBeenCalled();
  });

  it("aggregates callsUsed across passes and stops at the maxCalls cap", async () => {
    mockRunConnectionBatch
      .mockResolvedValueOnce(pass({ stoppedReason: "completed", generated: 1, callsUsed: 6 }))
      .mockResolvedValueOnce(pass({ stoppedReason: "completed", generated: 1, callsUsed: 6 }));
    const summary = await runConnectionBatchLoop(
      opts({ apiKeys: ["k1"], apiKeyLabels: ["GEMINI_API1"], maxCalls: 10 }),
      hooks,
      new AbortController().signal
    );
    expect(summary.callsUsed).toBe(12);
    expect(summary.stoppedReason).toBe("call-budget");
    // second pass was given the remaining budget
    expect(mockRunConnectionBatch.mock.calls[1][0].maxCalls).toBe(4);
  });

  it("stops the loop (error) after consecutive passes that only fail cells", async () => {
    mockRunConnectionBatch.mockResolvedValue(
      pass({ stoppedReason: "completed", cellsFailed: 4, lastError: "bad JSON" })
    );
    const summary = await runConnectionBatchLoop(
      opts({ apiKeys: ["k1"], apiKeyLabels: ["GEMINI_API1"] }),
      hooks,
      new AbortController().signal
    );
    expect(summary.stoppedReason).toBe("error");
    expect(summary.error).toMatch(/only failed cells/);
    // FAILING_PASSES_BEFORE_ABORT = 3 → does not run thousands of passes
    expect(summary.passes).toBe(3);
  });

  it("propagates a cancelled inner pass", async () => {
    mockRunConnectionBatch.mockResolvedValueOnce(pass({ stoppedReason: "cancelled" }));
    const summary = await runConnectionBatchLoop(opts(), hooks, new AbortController().signal);
    expect(summary.stoppedReason).toBe("cancelled");
  });

  it("treats an empty work list as immediately done", async () => {
    mockRunConnectionBatch.mockResolvedValueOnce(
      pass({ stoppedReason: "completed", workListSize: 0 })
    );
    const summary = await runConnectionBatchLoop(
      opts({ apiKeys: ["k1"], apiKeyLabels: ["GEMINI_API1"] }),
      hooks,
      new AbortController().signal
    );
    expect(summary.stoppedReason).toBe("work-exhausted");
    expect(summary.passes).toBe(1);
  });

  it("never trips the budget with Infinity caps", async () => {
    mockRunConnectionBatch.mockResolvedValue(
      pass({ stoppedReason: "quota-daily", callsUsed: 999 })
    );
    const summary = await runConnectionBatchLoop(opts(), hooks, new AbortController().signal);
    expect(summary.stoppedReason).toBe("all-keys-daily");
  });
});
