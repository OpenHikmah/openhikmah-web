import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockReset } = vi.hoisted(() => ({ mockReset: vi.fn() }));
vi.mock("@/lib/ai/ai", () => ({ resetGeminiRateLimitState: mockReset }));

import {
  newRotationSummary,
  runKeyRotation,
  type KeyRotationOptions,
  type KeyRotationSummary,
  type RotationJob,
  type RotationPass,
} from "@/lib/ai/key-rotation";

const OPTS: KeyRotationOptions = {
  apiKeys: ["k1", "k2", "k3"],
  apiKeyLabels: ["GEMINI_API1", "GEMINI_API2", "GEMINI_API3"],
  callDelayMs: 0,
  maxCalls: Number.POSITIVE_INFINITY,
  maxCostUsd: Number.POSITIVE_INFINITY,
};

function pass(overrides: Partial<RotationPass> = {}): RotationPass {
  return {
    stoppedReason: "completed",
    cellsProcessed: 1,
    callsUsed: 2,
    costUsd: 0.5,
    cellsFailed: 0,
    ...overrides,
  };
}

/** A job whose passes come from a script, one entry per call, in order. */
function scripted(
  script: RotationPass[],
  extra: Partial<RotationJob<KeyRotationSummary, RotationPass>> = {}
) {
  const calls: { apiKey: string; budget: { maxCalls: number; maxCostUsd: number } }[] = [];
  const job: RotationJob<KeyRotationSummary, RotationPass> = {
    prefix: "[t]",
    maxPassesPerKey: 10,
    runPass: async (apiKey, budget) => {
      calls.push({ apiKey, budget });
      const next = script.shift();
      if (!next) throw new Error("script exhausted");
      return next;
    },
    mergeCounters: () => {},
    onCompleted: () => false,
    describeCounters: (a) => `fail=${a.cellsFailed}`,
    ...extra,
  };
  return { job, calls };
}

function run(
  job: RotationJob<KeyRotationSummary, RotationPass>,
  opts: Partial<KeyRotationOptions> = {},
  signal: AbortSignal = new AbortController().signal
) {
  const lines: string[] = [];
  const promise = runKeyRotation(
    { ...OPTS, ...opts },
    newRotationSummary(),
    job,
    { onProgress: (l) => lines.push(l) },
    signal
  );
  return { promise, lines };
}

beforeEach(() => {
  mockReset.mockReset();
});

describe("runKeyRotation", () => {
  it("rotates on a daily quota and ends all-keys-daily once every key is spent", async () => {
    const { job, calls } = scripted([
      pass({ stoppedReason: "quota-daily" }),
      pass({ stoppedReason: "quota-daily" }),
      pass({ stoppedReason: "quota-daily" }),
    ]);
    const { promise, lines } = run(job);
    const s = await promise;
    expect(s).toMatchObject({
      stoppedReason: "all-keys-daily",
      passes: 3,
      keysUsed: 3,
      keysExhausted: ["GEMINI_API1", "GEMINI_API2", "GEMINI_API3"],
    });
    expect(calls.map((c) => c.apiKey)).toEqual(["k1", "k2", "k3"]);
    expect(lines.some((l) => l.startsWith("[t] DONE (all-keys-daily)"))).toBe(true);
  });

  it("clears each key's rate-limit state before it starts, and runs onKeyStart", async () => {
    const onKeyStart = vi.fn();
    const { job } = scripted(
      [
        pass({ stoppedReason: "quota-daily" }),
        pass({ stoppedReason: "quota-daily" }),
        pass({ stoppedReason: "quota-daily" }),
      ],
      { onKeyStart }
    );
    await run(job).promise;
    expect(mockReset.mock.calls.map((c) => c[0])).toEqual(["k1", "k2", "k3"]);
    expect(onKeyStart).toHaveBeenCalledTimes(3);
  });

  it("records invalid and rate-limited keys separately", async () => {
    const { job } = scripted([
      pass({ stoppedReason: "key-invalid" }),
      pass({ stoppedReason: "rate-limited" }),
      pass({ stoppedReason: "quota-daily" }),
    ]);
    const s = await run(job).promise;
    expect(s.keysInvalid).toEqual(["GEMINI_API1"]);
    expect(s.keysRateLimited).toEqual(["GEMINI_API2"]);
    expect(s.keysExhausted).toEqual(["GEMINI_API3"]);
    expect(s.stoppedReason).toBe("all-keys-daily");
  });

  it("is an error, not all-keys-daily, when no key ever hit a real daily quota", async () => {
    const { job } = scripted([
      pass({ stoppedReason: "key-invalid" }),
      pass({ stoppedReason: "rate-limited" }),
      pass({ stoppedReason: "key-invalid" }),
    ]);
    const s = await run(job).promise;
    expect(s.stoppedReason).toBe("error");
    expect(s.error).toMatch(/none hit a daily quota/);
  });

  it("appends the job's note to the all-keys-spent line", async () => {
    const { job } = scripted(
      [
        pass({ stoppedReason: "quota-daily" }),
        pass({ stoppedReason: "quota-daily" }),
        pass({ stoppedReason: "quota-daily" }),
      ],
      { allKeysSpentNote: "Start again tomorrow" }
    );
    const { promise, lines } = run(job);
    await promise;
    expect(lines.some((l) => l.includes("Start again tomorrow"))).toBe(true);
  });

  it("stops without rotating on a non-quota pass failure, keeping the pass error", async () => {
    const { job, calls } = scripted([pass({ stoppedReason: "error", error: "bad model" })]);
    const s = await run(job).promise;
    expect(s).toMatchObject({ stoppedReason: "error", error: "bad model", keysUsed: 1 });
    expect(calls).toHaveLength(1);
  });

  it("accumulates the shared counters across passes and carries lastError", async () => {
    const { job } = scripted([
      pass({ cellsFailed: 1, lastError: "first" }),
      pass({ cellsFailed: 2, lastError: "second" }),
      pass({ stoppedReason: "quota-daily", cellsProcessed: 4, callsUsed: 3, costUsd: 0.25 }),
      pass({ stoppedReason: "quota-daily" }),
      pass({ stoppedReason: "quota-daily" }),
    ]);
    const s = await run(job).promise;
    expect(s).toMatchObject({
      cellsProcessed: 1 + 1 + 4 + 1 + 1,
      callsUsed: 2 + 2 + 3 + 2 + 2,
      costUsd: 0.5 + 0.5 + 0.25 + 0.5 + 0.5,
      cellsFailed: 3,
      lastError: "second",
    });
  });

  it("hands each pass the budget that is left, not the original cap", async () => {
    const { job, calls } = scripted([
      pass({ callsUsed: 4, costUsd: 1.5 }),
      pass({ callsUsed: 4, costUsd: 1.5, stoppedReason: "quota-daily" }),
      pass({ stoppedReason: "call-budget" }),
    ]);
    await run(job, { maxCalls: 20, maxCostUsd: 10 }).promise;
    expect(calls[0].budget).toEqual({ maxCalls: 20, maxCostUsd: 10 });
    expect(calls[1].budget).toEqual({ maxCalls: 16, maxCostUsd: 8.5 });
    expect(calls[2].budget).toEqual({ maxCalls: 12, maxCostUsd: 7 });
  });

  it("stops with call-budget before running a pass once the call cap is reached", async () => {
    const { job, calls } = scripted([pass({ callsUsed: 5 })]);
    const s = await run(job, { maxCalls: 5 }).promise;
    expect(s.stoppedReason).toBe("call-budget");
    expect(calls).toHaveLength(1);
  });

  it("stops with cost-budget before running a pass once the cost cap is reached", async () => {
    const { job, calls } = scripted([pass({ costUsd: 3 })]);
    const s = await run(job, { maxCostUsd: 3 }).promise;
    expect(s.stoppedReason).toBe("cost-budget");
    expect(calls).toHaveLength(1);
  });

  it.each(["cancelled", "call-budget", "cost-budget"] as const)(
    "ends the loop with %s when the pass reports it",
    async (reason) => {
      const { job } = scripted([pass({ stoppedReason: reason })]);
      const s = await run(job).promise;
      expect(s.stoppedReason).toBe(reason);
    }
  );

  it("ends cancelled, running no pass, when the signal is already aborted", async () => {
    const ac = new AbortController();
    ac.abort();
    const { job, calls } = scripted([]);
    const s = await run(job, {}, ac.signal).promise;
    expect(s.stoppedReason).toBe("cancelled");
    expect(calls).toHaveLength(0);
  });

  it("ends the loop when onCompleted returns true, leaving the reason the job set", async () => {
    const { job } = scripted([pass()], {
      onCompleted: (agg) => {
        agg.stoppedReason = "work-exhausted";
        return true;
      },
      onFinish: (_agg, log) => log("ALL DONE"),
    });
    const { promise, lines } = run(job);
    const s = await promise;
    expect(s.stoppedReason).toBe("work-exhausted");
    expect(lines.indexOf("[t] ALL DONE")).toBeGreaterThan(-1);
    expect(lines.indexOf("[t] ALL DONE")).toBeLessThan(
      lines.findIndex((l) => l.includes("DONE (work-exhausted)"))
    );
  });

  it("keeps passing on the same key while onCompleted returns false", async () => {
    const { job, calls } = scripted([pass(), pass(), pass({ stoppedReason: "quota-daily" })]);
    await run(job, { apiKeys: ["only"], apiKeyLabels: ["ONLY"] }).promise;
    expect(calls.map((c) => c.apiKey)).toEqual(["only", "only", "only"]);
  });

  it("ends as an error when a key hits the per-key pass ceiling without converging", async () => {
    const { job } = scripted([pass(), pass(), pass()], { maxPassesPerKey: 3 });
    const s = await run(job).promise;
    expect(s.stoppedReason).toBe("error");
    expect(s.error).toBe("key GEMINI_API1 ran 3 passes without converging");
  });

  it("merges the job-specific counters through mergeCounters", async () => {
    type Agg = KeyRotationSummary & { widgets: number };
    const job: RotationJob<Agg, RotationPass & { widgets: number }> = {
      prefix: "[t]",
      maxPassesPerKey: 5,
      runPass: vi
        .fn()
        .mockResolvedValueOnce({ ...pass(), widgets: 3 })
        .mockResolvedValue({ ...pass({ stoppedReason: "quota-daily" }), widgets: 4 }),
      mergeCounters: (a, p) => {
        a.widgets += p.widgets;
      },
      onCompleted: () => false,
      describeCounters: (a) => `widgets=${a.widgets}`,
    };
    const lines: string[] = [];
    const s = await runKeyRotation(
      OPTS,
      { ...newRotationSummary(), widgets: 0 },
      job,
      { onProgress: (l) => lines.push(l) },
      new AbortController().signal
    );
    expect(s.widgets).toBe(3 + 4 + 4 + 4);
    expect(lines.at(-1)).toContain("widgets=15");
  });
});
