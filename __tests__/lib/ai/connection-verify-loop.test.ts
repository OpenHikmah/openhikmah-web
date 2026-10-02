import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRunVerifyBatch, mockResetRateLimit } = vi.hoisted(() => ({
  mockRunVerifyBatch: vi.fn(),
  mockResetRateLimit: vi.fn(),
}));
vi.mock("@/lib/ai/connection-verify-batch", () => ({ runVerifyBatch: mockRunVerifyBatch }));
vi.mock("@/lib/ai/ai", () => ({ resetGeminiRateLimitState: mockResetRateLimit }));

import { runVerifyLoop, type VerifyLoopOptions } from "@/lib/ai/connection-verify-loop";

const OPTS: VerifyLoopOptions = {
  apiKeys: ["key-1", "key-2"],
  apiKeyLabels: ["GEMINI_API1", "GEMINI_API2"],
  callDelayMs: 1500,
  maxCalls: Number.POSITIVE_INFINITY,
  maxCostUsd: Number.POSITIVE_INFINITY,
};

/** A pass summary with sensible zeros; override per test. */
function pass(over: Record<string, unknown> = {}) {
  return {
    stoppedReason: "completed",
    cellsProcessed: 0,
    callsUsed: 0,
    costUsd: 0,
    cellsVerified: 0,
    rowsFlagged: 0,
    cellsFailed: 0,
    workListSize: 0,
    ...over,
  };
}

function run(opts: Partial<VerifyLoopOptions> = {}, signal = new AbortController().signal) {
  const lines: string[] = [];
  const promise = runVerifyLoop({ ...OPTS, ...opts }, { onProgress: (l) => lines.push(l) }, signal);
  return { promise, lines };
}

beforeEach(() => {
  mockRunVerifyBatch.mockReset();
  mockResetRateLimit.mockReset();
});

describe("runVerifyLoop", () => {
  it("keeps passing on one key until a pass finds nothing left, then reports ALL DONE", async () => {
    mockRunVerifyBatch
      .mockResolvedValueOnce(
        pass({
          workListSize: 10,
          cellsProcessed: 10,
          cellsVerified: 9,
          rowsFlagged: 2,
          cellsFailed: 1,
          callsUsed: 10,
          costUsd: 0.2,
        })
      )
      .mockResolvedValueOnce(
        pass({
          workListSize: 1,
          cellsProcessed: 1,
          cellsVerified: 1,
          rowsFlagged: 1,
          callsUsed: 1,
          costUsd: 0.02,
        })
      )
      .mockResolvedValueOnce(pass({ workListSize: 0 }));

    const { promise, lines } = run();
    const summary = await promise;

    expect(summary).toMatchObject({
      stoppedReason: "work-exhausted",
      passes: 3,
      keysUsed: 1,
      cellsVerified: 10,
      rowsFlagged: 3,
      cellsFailed: 1,
      callsUsed: 11,
    });
    expect(mockRunVerifyBatch).toHaveBeenCalledTimes(3);
    const done = lines.find((l) => l.includes("ALL DONE"));
    expect(done).toContain("3 connection(s) were flagged for review");
  });

  it("finishes immediately, with ALL DONE, when there is nothing to verify", async () => {
    mockRunVerifyBatch.mockResolvedValueOnce(pass());
    const { promise, lines } = run();
    expect((await promise).stoppedReason).toBe("work-exhausted");
    expect(lines.some((l) => l.includes("ALL DONE"))).toBe(true);
  });

  it("runs each pass on Gemini with the current key value, delay and model, and resets the rate-limit state of that key", async () => {
    mockRunVerifyBatch.mockResolvedValueOnce(pass());
    await run({ model: "gemini-3.5-flash-lite" }).promise;
    expect(mockRunVerifyBatch.mock.calls[0][0]).toMatchObject({
      provider: "gemini",
      model: "gemini-3.5-flash-lite",
      apiKey: "key-1",
      callDelayMs: 1500,
    });
    expect(mockResetRateLimit).toHaveBeenCalledWith("key-1");
  });

  it("rotates to the next key when one hits its daily quota, and finishes on the next", async () => {
    mockRunVerifyBatch
      .mockResolvedValueOnce(
        pass({ stoppedReason: "quota-daily", workListSize: 50, cellsVerified: 20, callsUsed: 20 })
      )
      .mockResolvedValueOnce(pass({ workListSize: 30, cellsVerified: 30, callsUsed: 30 }))
      .mockResolvedValueOnce(pass());

    const { promise } = run();
    const summary = await promise;

    expect(summary).toMatchObject({
      stoppedReason: "work-exhausted",
      keysUsed: 2,
      keysExhausted: ["GEMINI_API1"],
      cellsVerified: 50,
    });
    expect(mockRunVerifyBatch.mock.calls.map((c) => c[0].apiKey)).toEqual([
      "key-1",
      "key-2",
      "key-2",
    ]);
    expect(mockResetRateLimit.mock.calls.map((c) => c[0])).toEqual(["key-1", "key-2"]);
  });

  it("rotates away from an invalid key and from a rate-limited key too", async () => {
    mockRunVerifyBatch
      .mockResolvedValueOnce(pass({ stoppedReason: "key-invalid" }))
      .mockResolvedValueOnce(pass({ stoppedReason: "rate-limited" }))
      .mockResolvedValueOnce(pass());
    const summary = await run({
      apiKeys: ["key-1", "key-2", "key-3"],
      apiKeyLabels: ["GEMINI_API1", "GEMINI_API2", "GEMINI_API3"],
    }).promise;
    expect(summary).toMatchObject({
      stoppedReason: "work-exhausted",
      keysInvalid: ["GEMINI_API1"],
      keysRateLimited: ["GEMINI_API2"],
    });
  });

  it("ends as all-keys-daily, and says it is not finished, when every key is spent", async () => {
    mockRunVerifyBatch.mockResolvedValue(pass({ stoppedReason: "quota-daily", workListSize: 5 }));
    const { promise, lines } = run();
    const summary = await promise;
    expect(summary.stoppedReason).toBe("all-keys-daily");
    expect(summary.keysExhausted).toEqual(["GEMINI_API1", "GEMINI_API2"]);
    expect(lines.some((l) => l.includes("Not finished"))).toBe(true);
    expect(lines.some((l) => l.includes("ALL DONE"))).toBe(false);
  });

  it("is an error, not all-keys-daily, when no key ever hit a daily quota (all invalid or limited)", async () => {
    mockRunVerifyBatch
      .mockResolvedValueOnce(pass({ stoppedReason: "key-invalid" }))
      .mockResolvedValueOnce(pass({ stoppedReason: "rate-limited" }));
    const summary = await run().promise;
    expect(summary.stoppedReason).toBe("error");
    expect(summary.error).toMatch(/invalid or rate-limited/);
  });

  it("stops on a non-quota pass failure without rotating (the same fault would hit every key)", async () => {
    mockRunVerifyBatch.mockResolvedValueOnce(
      pass({ stoppedReason: "error", error: "aborted after 5 consecutive cell failures" })
    );
    const summary = await run().promise;
    expect(summary).toMatchObject({
      stoppedReason: "error",
      error: "aborted after 5 consecutive cell failures",
      keysUsed: 1,
    });
    expect(mockRunVerifyBatch).toHaveBeenCalledTimes(1);
  });

  it("passes the remaining budget to each pass and stops when a pass hits it", async () => {
    mockRunVerifyBatch
      .mockResolvedValueOnce(
        pass({ workListSize: 10, callsUsed: 6, costUsd: 0.5, cellsVerified: 6 })
      )
      .mockResolvedValueOnce(
        pass({ stoppedReason: "call-budget", workListSize: 4, callsUsed: 4, cellsVerified: 4 })
      );
    const summary = await run({ maxCalls: 10, maxCostUsd: 5 }).promise;

    expect(summary).toMatchObject({ stoppedReason: "call-budget", callsUsed: 10 });
    expect(mockRunVerifyBatch.mock.calls[0][0]).toMatchObject({ maxCalls: 10, maxCostUsd: 5 });
    expect(mockRunVerifyBatch.mock.calls[1][0]).toMatchObject({ maxCalls: 4, maxCostUsd: 4.5 });
  });

  it("stops before another pass once a cap is already used up", async () => {
    mockRunVerifyBatch.mockResolvedValueOnce(
      pass({ workListSize: 10, callsUsed: 5, costUsd: 0.1, cellsVerified: 5 })
    );
    const summary = await run({ maxCalls: 5 }).promise;
    expect(summary.stoppedReason).toBe("call-budget");
    expect(mockRunVerifyBatch).toHaveBeenCalledTimes(1);

    mockRunVerifyBatch.mockReset();
    mockRunVerifyBatch.mockResolvedValueOnce(
      pass({ workListSize: 10, callsUsed: 1, costUsd: 3, cellsVerified: 1 })
    );
    expect((await run({ maxCostUsd: 3 }).promise).stoppedReason).toBe("cost-budget");
  });

  it("does no work when already cancelled, and propagates a cancelled pass", async () => {
    const aborted = new AbortController();
    aborted.abort();
    expect((await run({}, aborted.signal).promise).stoppedReason).toBe("cancelled");
    expect(mockRunVerifyBatch).not.toHaveBeenCalled();

    mockRunVerifyBatch.mockResolvedValueOnce(pass({ stoppedReason: "cancelled", workListSize: 3 }));
    expect((await run().promise).stoppedReason).toBe("cancelled");
  });

  it("gives up with an error if a key never converges", async () => {
    mockRunVerifyBatch.mockResolvedValue(
      pass({ workListSize: 2, cellsFailed: 2, cellsVerified: 0 })
    );
    const summary = await run({ apiKeys: ["key-1"], apiKeyLabels: ["GEMINI_API1"] }).promise;
    expect(summary.stoppedReason).toBe("error");
    expect(summary.error).toMatch(/without converging/);
    expect(mockRunVerifyBatch).toHaveBeenCalledTimes(50);
  });

  it("never logs a key value, only labels", async () => {
    mockRunVerifyBatch.mockResolvedValueOnce(pass());
    const { promise, lines } = run();
    await promise;
    expect(lines.join("\n")).not.toContain("key-1");
    expect(lines.join("\n")).toContain("GEMINI_API1");
  });
});
