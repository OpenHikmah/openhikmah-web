import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";

function makeDbChain(resolveWith: unknown) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = new Proxy(
    function () {
      return chain;
    },
    {
      get(_t, prop) {
        if (prop === "then")
          return (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
            Promise.resolve(resolveWith).then(res, rej);
        return () => chain;
      },
      apply() {
        return chain;
      },
    }
  );
  return chain;
}

const { mockInsert, mockSelect, mockUpdate } = vi.hoisted(() => ({
  mockInsert: vi.fn(),
  mockSelect: vi.fn(),
  mockUpdate: vi.fn(),
}));
vi.mock("@/lib/infra/db", () => ({
  db: { insert: mockInsert, select: mockSelect, update: mockUpdate },
}));

class FakeChildProcess extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
}

const { mockSpawn, lastChild } = vi.hoisted(() => ({
  mockSpawn: vi.fn(),
  lastChild: { current: null as FakeChildProcess | null },
}));
vi.mock("node:child_process", () => ({
  spawn: mockSpawn,
  default: { spawn: mockSpawn },
}));

const { mockTryAcquireJobLock, mockReleaseJobLock } = vi.hoisted(() => ({
  mockTryAcquireJobLock: vi.fn(),
  mockReleaseJobLock: vi.fn(),
}));
vi.mock("@/lib/admin/job-lock", () => ({
  JOB_LOCK_KEY: 776142517,
  tryAcquireJobLock: mockTryAcquireJobLock,
  releaseJobLock: mockReleaseJobLock,
}));

const { mockRunConnectionBatch } = vi.hoisted(() => ({ mockRunConnectionBatch: vi.fn() }));
vi.mock("@/lib/ai/connection-batch", () => ({ runConnectionBatch: mockRunConnectionBatch }));

const { mockRunVerifyLoop } = vi.hoisted(() => ({ mockRunVerifyLoop: vi.fn() }));
vi.mock("@/lib/ai/connection-verify-loop", () => ({ runVerifyLoop: mockRunVerifyLoop }));

const { mockRunVerifyBatch } = vi.hoisted(() => ({ mockRunVerifyBatch: vi.fn() }));
vi.mock("@/lib/ai/connection-verify-batch", () => ({ runVerifyBatch: mockRunVerifyBatch }));

const { mockRunConnectionBatchLoop } = vi.hoisted(() => ({
  mockRunConnectionBatchLoop: vi.fn(),
}));
vi.mock("@/lib/ai/connection-batch-loop", () => ({
  runConnectionBatchLoop: mockRunConnectionBatchLoop,
}));

import {
  startJob,
  stopJob,
  embedCoverage,
  JOBS,
  configuredGeminiKeys,
} from "@/lib/admin/job-runner";

beforeEach(() => {
  mockInsert.mockReset().mockReturnValue(makeDbChain([{ id: 42 }]));
  mockSelect.mockReset().mockReturnValue(makeDbChain([{ total: 0 }]));
  mockUpdate.mockReset().mockReturnValue(makeDbChain([]));
  mockSpawn.mockReset().mockImplementation(() => {
    const child = new FakeChildProcess();
    lastChild.current = child;
    return child;
  });
  mockRunConnectionBatch.mockReset().mockResolvedValue({ stoppedReason: "completed" });
  mockRunConnectionBatchLoop.mockReset().mockResolvedValue({ stoppedReason: "all-keys-daily" });
  mockRunVerifyBatch.mockReset().mockResolvedValue({ stoppedReason: "completed" });
  mockRunVerifyLoop.mockReset().mockResolvedValue({ stoppedReason: "work-exhausted" });
  mockTryAcquireJobLock.mockReset().mockResolvedValue(true);
  mockReleaseJobLock.mockReset().mockResolvedValue(undefined);
});

// `running` is module-level state in job-runner.ts (by design — it's the
// in-process "is a job running right now" guard). Close out whatever the test
// started so the guard doesn't leak into the next test.
afterEach(() => {
  lastChild.current?.emit("close", 0);
});

describe("startJob", () => {
  it("rejects an unknown job id", async () => {
    await expect(startJob("bogus", "qf-admin")).rejects.toThrow("Unknown job");
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it("rejects embed-corpus when GEMINI_API_KEY is missing", async () => {
    const prev = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      await expect(startJob("embed-corpus", "qf-admin")).rejects.toThrow("GEMINI_API_KEY");
      expect(mockSpawn).not.toHaveBeenCalled();
    } finally {
      if (prev !== undefined) process.env.GEMINI_API_KEY = prev;
    }
  });

  it("spawns the job's script via bun and records a running job_runs row", async () => {
    const { runId } = await startJob("seed-morphology", "qf-admin");
    expect(runId).toBe(42);
    expect(mockSpawn).toHaveBeenCalledWith(
      "bun",
      ["scripts/seed-morphology.mjs"],
      expect.objectContaining({ cwd: process.cwd() })
    );
    expect(mockInsert).toHaveBeenCalled();
  });

  it("rejects starting a second job while one is already running", async () => {
    await startJob("seed-morphology", "qf-admin");
    await expect(startJob("seed-quran", "qf-admin")).rejects.toThrow("already running");
  });

  it("only lets one of two near-simultaneous (un-awaited) calls succeed", async () => {
    const first = startJob("seed-morphology", "qf-admin");
    const second = startJob("seed-quran", "qf-admin");
    const results = await Promise.allSettled([first, second]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason.message).toMatch(/already running/);
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it("releases the running guard when the insert rejects, allowing a retry to succeed", async () => {
    mockInsert.mockReturnValueOnce(makeDbChain(Promise.reject(new Error("insert failed"))));
    await expect(startJob("seed-morphology", "qf-admin")).rejects.toThrow("insert failed");

    const { runId } = await startJob("seed-quran", "qf-admin");
    expect(runId).toBe(42);
    expect(mockInsert).toHaveBeenCalledTimes(2);
  });

  it("rejects when another process holds the advisory lock, without inserting a row", async () => {
    mockTryAcquireJobLock.mockResolvedValueOnce(false);
    await expect(startJob("seed-morphology", "qf-admin")).rejects.toThrow("already running");
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockSpawn).not.toHaveBeenCalled();
    // Guard released → a retry (once the lock frees) can proceed.
    const { runId } = await startJob("seed-quran", "qf-admin");
    expect(runId).toBe(42);
  });

  it("releases the advisory lock when the insert rejects", async () => {
    mockInsert.mockReturnValueOnce(makeDbChain(Promise.reject(new Error("insert failed"))));
    await expect(startJob("seed-morphology", "qf-admin")).rejects.toThrow("insert failed");
    expect(mockReleaseJobLock).toHaveBeenCalledTimes(1);
  });

  it("releases the advisory lock once the child process closes", async () => {
    await startJob("seed-morphology", "qf-admin");
    expect(mockTryAcquireJobLock).toHaveBeenCalledTimes(1);
    lastChild.current?.emit("close", 0);
    await Promise.resolve();
    await Promise.resolve();
    expect(mockReleaseJobLock).toHaveBeenCalledTimes(1);
  });

  it("releases the advisory lock and guard if spawn throws synchronously", async () => {
    mockSpawn.mockImplementationOnce(() => {
      throw new Error("EAGAIN");
    });
    await expect(startJob("seed-morphology", "qf-admin")).rejects.toThrow("EAGAIN");
    await Promise.resolve();
    expect(mockReleaseJobLock).toHaveBeenCalledTimes(1);
    // Guard released → a retry can proceed.
    const { runId } = await startJob("seed-quran", "qf-admin");
    expect(runId).toBe(42);
  });

  it("clears the running guard once the child process closes", async () => {
    await startJob("seed-morphology", "qf-admin");
    lastChild.current?.emit("close", 0);
    // Flush the microtask queue so the close handler's async db.update resolves.
    await Promise.resolve();
    await Promise.resolve();
    const { runId } = await startJob("seed-quran", "qf-admin");
    expect(runId).toBe(42);
  });
});

describe("JOBS", () => {
  it("registers the backfill scripts plus seed-translations and backfill-connections", () => {
    expect(JOBS.map((j) => j.id)).toEqual([
      "seed-quran",
      "seed-morphology",
      "embed-corpus",
      "seed-translations",
      "backfill-connections",
      "verify-connections",
    ]);
  });
});

describe("startJob — backfill-connections params", () => {
  const validParams = {
    mode: "baseline",
    provider: "claude",
    locales: "tr,ru",
    maxCalls: 10,
    maxCostUsd: 2,
  };

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
    process.env.GEMINI_API_KEY = "test-gemini-key";
  });

  it("rejects the job with no params", async () => {
    await expect(startJob("backfill-connections", "qf-admin")).rejects.toThrow(/requires params/);
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it("rejects a model that isn't valid for the chosen provider, accepts a valid one", async () => {
    await expect(
      startJob("backfill-connections", "qf-admin", {
        ...validParams,
        provider: "claude",
        model: "gemini-3.7-flash",
      })
    ).rejects.toThrow(/model/);
    await expect(
      startJob("backfill-connections", "qf-admin", { ...validParams, model: "not-a-model" })
    ).rejects.toThrow(/model/);

    mockRunConnectionBatch.mockReturnValueOnce(new Promise(() => {}));
    await startJob("backfill-connections", "qf-admin", {
      ...validParams,
      provider: "gemini",
      model: "gemini-3.7-flash",
    });
    expect(mockRunConnectionBatch).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "gemini", model: "gemini-3.7-flash" }),
      expect.anything(),
      expect.any(AbortSignal)
    );
  });

  it("rejects a bad mode / provider / budget / locale", async () => {
    await expect(
      startJob("backfill-connections", "qf-admin", { ...validParams, mode: "sideways" })
    ).rejects.toThrow(/mode/);
    await expect(
      startJob("backfill-connections", "qf-admin", { ...validParams, provider: "openai" })
    ).rejects.toThrow(/provider/);
    await expect(
      startJob("backfill-connections", "qf-admin", { ...validParams, maxCalls: 0 })
    ).rejects.toThrow(/maxCalls/);
    await expect(
      startJob("backfill-connections", "qf-admin", { ...validParams, maxCalls: 0.5 })
    ).rejects.toThrow(/maxCalls/);
    await expect(
      startJob("backfill-connections", "qf-admin", { ...validParams, maxCostUsd: -1 })
    ).rejects.toThrow(/maxCostUsd/);
    await expect(
      startJob("backfill-connections", "qf-admin", { ...validParams, locales: "tr,de" })
    ).rejects.toThrow(/locales/);
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it("requires the provider's API key", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(
      startJob("backfill-connections", "qf-admin", { ...validParams, provider: "claude" })
    ).rejects.toThrow(/ANTHROPIC_API_KEY/);
  });

  it("runs in-process (no spawn) and passes parsed options to runConnectionBatch", async () => {
    let resolveBatch!: (v: unknown) => void;
    mockRunConnectionBatch.mockReturnValueOnce(new Promise((r) => (resolveBatch = r)));

    const { runId } = await startJob("backfill-connections", "qf-admin", validParams);
    expect(runId).toBe(42);
    expect(mockSpawn).not.toHaveBeenCalled();
    expect(mockRunConnectionBatch).toHaveBeenCalledWith(
      {
        mode: "baseline",
        provider: "claude",
        model: undefined,
        locales: ["tr", "ru"],
        maxCalls: 10,
        maxCostUsd: 2,
      },
      expect.objectContaining({ onProgress: expect.any(Function) }),
      expect.any(AbortSignal)
    );

    resolveBatch({ stoppedReason: "completed" });
    await Promise.resolve();
    await Promise.resolve();
    // Guard released → a new job can start.
    const next = await startJob("seed-quran", "qf-admin");
    expect(next.runId).toBe(42);
  });

  it("records a failed run and releases the guard when runConnectionBatch throws", async () => {
    mockRunConnectionBatch.mockRejectedValueOnce(new Error("Anthropic 402"));
    await startJob("backfill-connections", "qf-admin", validParams);
    await Promise.resolve();
    await Promise.resolve();

    const failed = mockUpdate.mock.calls.length > 0;
    expect(failed).toBe(true);
    const next = await startJob("seed-quran", "qf-admin");
    expect(next.runId).toBe(42);
  });

  it("records a failed run when the batch stops with reason 'error'", async () => {
    mockRunConnectionBatch.mockResolvedValueOnce({
      stoppedReason: "error",
      error: "bad work list",
    });
    await startJob("backfill-connections", "qf-admin", validParams);
    await Promise.resolve();
    await Promise.resolve();
    const next = await startJob("seed-quran", "qf-admin");
    expect(next.runId).toBe(42);
  });

  it("rejects params on a job that does not accept them", async () => {
    await expect(startJob("seed-quran", "qf-admin", { mode: "baseline" })).rejects.toThrow(
      /does not accept params/
    );
  });

  it("records a cancelled run when the batch stops with reason 'cancelled'", async () => {
    mockRunConnectionBatch.mockResolvedValueOnce({ stoppedReason: "cancelled" });
    await startJob("backfill-connections", "qf-admin", validParams);
    await Promise.resolve();
    await Promise.resolve();
    expect(mockUpdate).toHaveBeenCalled();
    const next = await startJob("seed-quran", "qf-admin");
    expect(next.runId).toBe(42);
  });
});

describe("startJob — verify-connections", () => {
  const validParams = { provider: "claude", maxCalls: 50, maxCostUsd: 3 };

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
    process.env.GEMINI_API_KEY = "test-gemini-key";
  });

  it("rejects the job with no params", async () => {
    await expect(startJob("verify-connections", "qf-admin")).rejects.toThrow(/requires params/);
    expect(mockRunVerifyBatch).not.toHaveBeenCalled();
  });

  it("requires a valid provider and positive budgets (there is no uncapped mode)", async () => {
    await expect(
      startJob("verify-connections", "qf-admin", { ...validParams, provider: "openai" })
    ).rejects.toThrow(/provider must be/);
    for (const maxCalls of [0, -1, 1.5, "abc", undefined]) {
      await expect(
        startJob("verify-connections", "qf-admin", { ...validParams, maxCalls })
      ).rejects.toThrow(/maxCalls/);
    }
    for (const maxCostUsd of [0, -1, "x", undefined]) {
      await expect(
        startJob("verify-connections", "qf-admin", { ...validParams, maxCostUsd })
      ).rejects.toThrow(/maxCostUsd/);
    }
    expect(mockRunVerifyBatch).not.toHaveBeenCalled();
  });

  it("rejects a model that does not belong to the provider and an out-of-range delay", async () => {
    await expect(
      startJob("verify-connections", "qf-admin", { ...validParams, model: "gemini-3.7-flash" })
    ).rejects.toThrow(/model must be one of/);
    for (const callDelayMs of [-1, 60_001, 1.5, "slow"]) {
      await expect(
        startJob("verify-connections", "qf-admin", { ...validParams, callDelayMs })
      ).rejects.toThrow(/callDelayMs/);
    }
  });

  it("requires the provider's API key", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(startJob("verify-connections", "qf-admin", validParams)).rejects.toThrow(
      "ANTHROPIC_API_KEY"
    );
    expect(mockRunVerifyBatch).not.toHaveBeenCalled();
  });

  it("runs in-process (no spawn) and passes parsed options to runVerifyBatch", async () => {
    await startJob("verify-connections", "qf-admin", validParams);
    expect(mockSpawn).not.toHaveBeenCalled();
    expect(mockRunVerifyBatch).toHaveBeenCalledWith(
      { provider: "claude", model: undefined, maxCalls: 50, maxCostUsd: 3, callDelayMs: 0 },
      expect.objectContaining({ onProgress: expect.any(Function) }),
      expect.any(AbortSignal)
    );
    expect(mockRunConnectionBatch).not.toHaveBeenCalled();
    expect(mockRunConnectionBatchLoop).not.toHaveBeenCalled();
  });

  it("defaults the delay to 1500 ms for Gemini and honours an explicit one", async () => {
    await startJob("verify-connections", "qf-admin", { ...validParams, provider: "gemini" });
    expect(mockRunVerifyBatch.mock.calls[0][0]).toMatchObject({ callDelayMs: 1500 });
    await Promise.resolve();
    await Promise.resolve();
    await startJob("verify-connections", "qf-admin", {
      ...validParams,
      provider: "gemini",
      callDelayMs: 250,
    });
    expect(mockRunVerifyBatch.mock.calls[1][0]).toMatchObject({ callDelayMs: 250 });
  });

  it("releases the guard when the run finishes, and records a failure when it stops with 'error'", async () => {
    mockRunVerifyBatch.mockResolvedValueOnce({ stoppedReason: "error", error: "provider down" });
    await startJob("verify-connections", "qf-admin", validParams);
    await Promise.resolve();
    await Promise.resolve();
    expect(mockUpdate).toHaveBeenCalled();
    const next = await startJob("seed-quran", "qf-admin");
    expect(next.runId).toBe(42);
  });

  /** Captures what finishRun writes to job_runs for the run that is about to finish. */
  function captureFinish() {
    const set = vi.fn(() => ({ where: () => ({ catch: () => undefined }) }));
    mockUpdate.mockReturnValue({ set });
    return set;
  }

  it.each([
    ["quota-daily", "failed", "Gemini daily quota exhausted"],
    ["key-invalid", "failed", "API key not valid"],
    ["rate-limited", "failed", "Gemini rate limit survived retries"],
  ])(
    "records a %s stop as a %s run carrying the provider message from lastError",
    async (stoppedReason, status, lastError) => {
      const set = captureFinish();
      mockRunVerifyBatch.mockResolvedValueOnce({ stoppedReason, lastError });

      await startJob("verify-connections", "qf-admin", validParams);
      await vi.waitFor(() => expect(set).toHaveBeenCalled());

      expect(set).toHaveBeenCalledWith(expect.objectContaining({ status, error: lastError }));
    }
  );

  it("prefers the run's own error over lastError", async () => {
    const set = captureFinish();
    mockRunVerifyBatch.mockResolvedValueOnce({
      stoppedReason: "error",
      error: "aborted after 5 consecutive cell failures",
      lastError: "503 upstream",
    });
    await startJob("verify-connections", "qf-admin", validParams);
    await vi.waitFor(() => expect(set).toHaveBeenCalled());
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        error: "aborted after 5 consecutive cell failures",
      })
    );
  });

  it("records a budget stop as a success and does not surface a cell-level lastError as the run error", async () => {
    const set = captureFinish();
    mockRunVerifyBatch.mockResolvedValueOnce({
      stoppedReason: "call-budget",
      lastError: "one cell failed earlier",
    });
    await startJob("verify-connections", "qf-admin", validParams);
    await vi.waitFor(() => expect(set).toHaveBeenCalled());
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ status: "success", error: null }));
  });

  it("stopJob aborts the verify run's signal", async () => {
    let signal!: AbortSignal;
    mockRunVerifyBatch.mockImplementationOnce(
      async (_o: unknown, _h: unknown, sig: AbortSignal) => {
        signal = sig;
        await new Promise<void>((resolve) => sig.addEventListener("abort", () => resolve()));
        return { stoppedReason: "cancelled" };
      }
    );
    await startJob("verify-connections", "qf-admin", validParams);
    expect(stopJob("qf-admin")).toEqual({ jobId: "verify-connections" });
    expect(signal.aborted).toBe(true);
  });
});

describe("startJob — verify-connections with the GEMINI_API1..5 key pool", () => {
  const single = { provider: "gemini", maxCalls: 50, maxCostUsd: 3 };

  beforeEach(() => {
    delete process.env.GEMINI_API_KEY;
    process.env.GEMINI_API1 = "key-1";
    process.env.GEMINI_API2 = "key-2";
    delete process.env.GEMINI_API3;
  });
  afterEach(() => {
    delete process.env.GEMINI_API1;
    delete process.env.GEMINI_API2;
  });

  it("a one-pass Gemini run uses the first pool key when GEMINI_API_KEY is not set", async () => {
    await startJob("verify-connections", "qf-admin", single);
    expect(mockRunVerifyBatch.mock.calls[0][0]).toMatchObject({
      provider: "gemini",
      apiKey: "key-1",
    });
  });

  it("prefers GEMINI_API_KEY when it is set (no explicit key override)", async () => {
    process.env.GEMINI_API_KEY = "main-key";
    await startJob("verify-connections", "qf-admin", single);
    expect(mockRunVerifyBatch.mock.calls[0][0].apiKey).toBeUndefined();
  });

  it("names both options when neither GEMINI_API_KEY nor any pool key is set", async () => {
    delete process.env.GEMINI_API1;
    delete process.env.GEMINI_API2;
    await expect(startJob("verify-connections", "qf-admin", single)).rejects.toThrow(
      /GEMINI_API_KEY.*GEMINI_API1/
    );
    expect(mockRunVerifyBatch).not.toHaveBeenCalled();
  });

  describe("loop mode", () => {
    const loop = { provider: "gemini", loop: true, keys: ["GEMINI_API1", "GEMINI_API2"] };

    it("requires provider=gemini", async () => {
      await expect(
        startJob("verify-connections", "qf-admin", { ...loop, provider: "claude" })
      ).rejects.toThrow(/loop mode requires provider=gemini/);
    });

    it("rejects no keys, an unknown key, and a key that is not configured", async () => {
      await expect(
        startJob("verify-connections", "qf-admin", { ...loop, keys: [] })
      ).rejects.toThrow(/at least one Gemini key/);
      await expect(
        startJob("verify-connections", "qf-admin", { ...loop, keys: ["NOPE"] })
      ).rejects.toThrow(/unknown key/);
      await expect(
        startJob("verify-connections", "qf-admin", { ...loop, keys: ["GEMINI_API3"] })
      ).rejects.toThrow(/not configured/);
    });

    it("does not need GEMINI_API_KEY, makes both budgets optional caps, and dispatches to the loop", async () => {
      await startJob("verify-connections", "qf-admin", loop);

      expect(mockRunVerifyBatch).not.toHaveBeenCalled();
      expect(mockRunVerifyLoop).toHaveBeenCalledWith(
        {
          model: undefined,
          apiKeys: ["key-1", "key-2"],
          apiKeyLabels: ["GEMINI_API1", "GEMINI_API2"],
          callDelayMs: 1500,
          maxCalls: Number.POSITIVE_INFINITY,
          maxCostUsd: Number.POSITIVE_INFINITY,
        },
        expect.objectContaining({ onProgress: expect.any(Function) }),
        expect.any(AbortSignal)
      );
    });

    it("passes optional caps, a model and a delay through, and rejects a bad delay or model", async () => {
      await startJob("verify-connections", "qf-admin", {
        ...loop,
        maxCalls: 100,
        maxCostUsd: 2.5,
        callDelayMs: 300,
      });
      expect(mockRunVerifyLoop.mock.calls[0][0]).toMatchObject({
        maxCalls: 100,
        maxCostUsd: 2.5,
        callDelayMs: 300,
      });
      await expect(
        startJob("verify-connections", "qf-admin", { ...loop, callDelayMs: 70_000 })
      ).rejects.toThrow(/callDelayMs/);
      await expect(
        startJob("verify-connections", "qf-admin", { ...loop, model: "claude-opus-4-7" })
      ).rejects.toThrow(/model must be one of/);
    });

    it("dedupes keys that hold the same secret, keeping the first label", async () => {
      process.env.GEMINI_API2 = "key-1";
      await startJob("verify-connections", "qf-admin", loop);
      expect(mockRunVerifyLoop.mock.calls[0][0]).toMatchObject({
        apiKeys: ["key-1"],
        apiKeyLabels: ["GEMINI_API1"],
      });
    });

    it.each([
      ["work-exhausted", "success", undefined],
      ["all-keys-daily", "success", undefined],
      ["call-budget", "success", undefined],
      ["cancelled", "cancelled", undefined],
      ["error", "failed", "every key hit the same wall"],
    ])("records a %s ending as %s", async (stoppedReason, status, error) => {
      const set = vi.fn(() => ({ where: () => ({ catch: () => undefined }) }));
      mockUpdate.mockReturnValue({ set });
      mockRunVerifyLoop.mockResolvedValueOnce({ stoppedReason, ...(error ? { error } : {}) });

      await startJob("verify-connections", "qf-admin", loop);
      await vi.waitFor(() => expect(set).toHaveBeenCalled());

      expect(set).toHaveBeenCalledWith(expect.objectContaining({ status, error: error ?? null }));
    });

    it("stopJob aborts the loop's signal", async () => {
      let signal!: AbortSignal;
      mockRunVerifyLoop.mockImplementationOnce(
        async (_o: unknown, _h: unknown, sig: AbortSignal) => {
          signal = sig;
          await new Promise<void>((resolve) => sig.addEventListener("abort", () => resolve()));
          return { stoppedReason: "cancelled" };
        }
      );
      await startJob("verify-connections", "qf-admin", loop);
      expect(stopJob("qf-admin")).toEqual({ jobId: "verify-connections" });
      expect(signal.aborted).toBe(true);
    });
  });
});

describe("stopJob", () => {
  const validParams = {
    mode: "baseline",
    provider: "claude",
    locales: "tr,ru",
    maxCalls: 10,
    maxCostUsd: 2,
  };

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
    process.env.GEMINI_API_KEY = "test-gemini-key";
  });

  it("throws when no job is running", () => {
    expect(() => stopJob("qf-admin")).toThrow(/No job is running/);
  });

  it("aborts the in-process backfill run's signal and releases the guard", async () => {
    let resolveBatch!: (v: unknown) => void;
    mockRunConnectionBatch.mockReturnValueOnce(new Promise((r) => (resolveBatch = r)));
    await startJob("backfill-connections", "qf-admin", validParams);

    const signal = mockRunConnectionBatch.mock.calls[0][2] as AbortSignal;
    expect(signal.aborted).toBe(false);

    expect(stopJob("qf-admin")).toEqual({ jobId: "backfill-connections" });
    expect(signal.aborted).toBe(true);

    resolveBatch({ stoppedReason: "cancelled" });
    await Promise.resolve();
    await Promise.resolve();
    expect(mockUpdate).toHaveBeenCalled();
    const next = await startJob("seed-quran", "qf-admin");
    expect(next.runId).toBe(42);
  });

  it("refuses to stop a spawned (script) job", async () => {
    await startJob("seed-morphology", "qf-admin");
    expect(() => stopJob("qf-admin")).toThrow(/can't be stopped/);
  });
});

describe("startJob — backfill-connections loop mode", () => {
  const base = { mode: "baseline", provider: "gemini", locales: "tr,ru", loop: true };

  beforeEach(() => {
    process.env.GEMINI_API1 = "key-1";
    process.env.GEMINI_API2 = "key-2";
    delete process.env.GEMINI_API3;
  });
  afterEach(() => {
    delete process.env.GEMINI_API1;
    delete process.env.GEMINI_API2;
  });

  it("rejects loop mode with provider=claude", async () => {
    await expect(
      startJob("backfill-connections", "qf-admin", {
        ...base,
        provider: "claude",
        keys: ["GEMINI_API1"],
      })
    ).rejects.toThrow(/gemini/i);
  });

  it("rejects loop mode with no keys / an unknown key / an unset key", async () => {
    await expect(
      startJob("backfill-connections", "qf-admin", { ...base, keys: [] })
    ).rejects.toThrow(/at least one Gemini key/);
    await expect(
      startJob("backfill-connections", "qf-admin", { ...base, keys: ["GEMINI_API9"] })
    ).rejects.toThrow(/unknown key/);
    await expect(
      startJob("backfill-connections", "qf-admin", { ...base, keys: ["GEMINI_API3"] })
    ).rejects.toThrow(/not configured in env/);
  });

  it("rejects an out-of-range or non-integer callDelayMs", async () => {
    for (const callDelayMs of [-5, 70000, 1.5]) {
      await expect(
        startJob("backfill-connections", "qf-admin", {
          ...base,
          keys: ["GEMINI_API1"],
          callDelayMs,
        })
      ).rejects.toThrow(/callDelayMs/);
    }
  });

  it("dispatches to runConnectionBatchLoop with resolved key values, labels, and Infinity caps", async () => {
    mockRunConnectionBatchLoop.mockReturnValueOnce(new Promise(() => {}));
    await startJob("backfill-connections", "qf-admin", {
      ...base,
      keys: ["GEMINI_API2", "GEMINI_API1"],
    });
    expect(mockRunConnectionBatch).not.toHaveBeenCalled();
    expect(mockRunConnectionBatchLoop).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "baseline",
        locales: ["tr", "ru"],
        apiKeys: ["key-1", "key-2"],
        apiKeyLabels: ["GEMINI_API1", "GEMINI_API2"],
        callDelayMs: 1500,
        maxCalls: Number.POSITIVE_INFINITY,
        maxCostUsd: Number.POSITIVE_INFINITY,
      }),
      expect.objectContaining({ onProgress: expect.any(Function) }),
      expect.any(AbortSignal)
    );
  });

  it("dedupes selected keys by value, keeping the first label (issue #567 C3)", async () => {
    // GEMINI_API3 secretly holds the same value as GEMINI_API1 — a pool
    // misconfiguration that must not make the loop "rotate" between two
    // labels that are really the same key/quota.
    process.env.GEMINI_API3 = "key-1";
    try {
      mockRunConnectionBatchLoop.mockReturnValueOnce(new Promise(() => {}));
      await startJob("backfill-connections", "qf-admin", {
        ...base,
        keys: ["GEMINI_API1", "GEMINI_API3", "GEMINI_API2"],
      });
      expect(mockRunConnectionBatchLoop).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKeys: ["key-1", "key-2"],
          apiKeyLabels: ["GEMINI_API1", "GEMINI_API2"],
        }),
        expect.anything(),
        expect.any(AbortSignal)
      );
    } finally {
      delete process.env.GEMINI_API3;
    }
  });

  it("does not require GEMINI_API_KEY for loop mode", async () => {
    const prev = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      mockRunConnectionBatchLoop.mockReturnValueOnce(new Promise(() => {}));
      await expect(
        startJob("backfill-connections", "qf-admin", { ...base, keys: ["GEMINI_API1"] })
      ).resolves.toEqual({ runId: 42 });
    } finally {
      if (prev !== undefined) process.env.GEMINI_API_KEY = prev;
    }
  });

  it("maps all-keys-daily → success, error → failed, cancelled → cancelled", async () => {
    const cases = [
      ["all-keys-daily", "success"],
      ["work-exhausted", "success"],
      ["error", "failed"],
      ["key-invalid", "failed"],
      ["cancelled", "cancelled"],
    ] as const;
    for (const [stoppedReason, expected] of cases) {
      // Capture the status object passed to db.update(...).set({ status, ... }).
      const setSpy = vi.fn().mockReturnValue(makeDbChain([]));
      mockUpdate.mockReturnValue(
        new Proxy(() => {}, { get: (_t, p) => (p === "set" ? setSpy : () => mockUpdate()) })
      );
      mockRunConnectionBatchLoop.mockResolvedValueOnce({ stoppedReason, error: "x" });
      await startJob("backfill-connections", "qf-admin", { ...base, keys: ["GEMINI_API1"] });
      await Promise.resolve();
      await Promise.resolve();
      expect(setSpy).toHaveBeenCalledWith(expect.objectContaining({ status: expected }));
      const next = await startJob("seed-quran", "qf-admin");
      expect(next.runId).toBe(42);
      lastChild.current?.emit("close", 0);
      await Promise.resolve();
      mockUpdate.mockReturnValue(makeDbChain([]));
    }
  });

  it("stopJob aborts the loop's signal", async () => {
    mockRunConnectionBatchLoop.mockReturnValueOnce(new Promise(() => {}));
    await startJob("backfill-connections", "qf-admin", { ...base, keys: ["GEMINI_API1"] });
    const signal = mockRunConnectionBatchLoop.mock.calls[0][2] as AbortSignal;
    expect(signal.aborted).toBe(false);
    expect(stopJob("qf-admin")).toEqual({ jobId: "backfill-connections" });
    expect(signal.aborted).toBe(true);
  });
});

describe("startJob — a rate-limited terminal reason", () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
  });

  it("is still a success for the single-pass backfill (unchanged); only the direct verify run treats it as a fault", async () => {
    const set = vi.fn(() => ({ where: () => ({ catch: () => undefined }) }));
    mockUpdate.mockReturnValue({ set });
    mockRunConnectionBatch.mockResolvedValueOnce({ stoppedReason: "rate-limited" });

    await startJob("backfill-connections", "qf-admin", {
      mode: "baseline",
      provider: "gemini",
      locales: "",
      maxCalls: 5,
      maxCostUsd: 1,
    });
    await vi.waitFor(() => expect(set).toHaveBeenCalled());

    expect(set).toHaveBeenCalledWith(expect.objectContaining({ status: "success" }));
  });
});

describe("configuredGeminiKeys", () => {
  it("returns only the pool names whose env var is set, in pool order", () => {
    delete process.env.GEMINI_API1;
    process.env.GEMINI_API2 = "b";
    process.env.GEMINI_API4 = "d";
    try {
      expect(configuredGeminiKeys()).toEqual(["GEMINI_API2", "GEMINI_API4"]);
    } finally {
      delete process.env.GEMINI_API2;
      delete process.env.GEMINI_API4;
    }
  });
});

describe("embedCoverage", () => {
  it("returns embedded/total counts from the verses and verse_embeddings tables", async () => {
    mockSelect
      .mockReturnValueOnce(makeDbChain([{ total: 6236 }]))
      .mockReturnValueOnce(makeDbChain([{ embedded: 6000 }]));
    const coverage = await embedCoverage();
    expect(coverage).toEqual({ embedded: 6000, total: 6236 });
  });
});
