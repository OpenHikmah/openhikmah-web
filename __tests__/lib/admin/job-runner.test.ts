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

const { mockRunConnectionBatch } = vi.hoisted(() => ({ mockRunConnectionBatch: vi.fn() }));
vi.mock("@/lib/ai/connection-batch", () => ({ runConnectionBatch: mockRunConnectionBatch }));

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
