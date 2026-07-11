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

import { startJob, embedCoverage, JOBS } from "@/lib/admin/job-runner";

beforeEach(() => {
  mockInsert.mockReset().mockReturnValue(makeDbChain([{ id: 42 }]));
  mockSelect.mockReset().mockReturnValue(makeDbChain([{ total: 0 }]));
  mockUpdate.mockReset().mockReturnValue(makeDbChain([]));
  mockSpawn.mockReset().mockImplementation(() => {
    const child = new FakeChildProcess();
    lastChild.current = child;
    return child;
  });
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
  it("registers exactly the three backfill scripts from issue #114", () => {
    expect(JOBS.map((j) => j.id)).toEqual(["seed-quran", "seed-morphology", "embed-corpus"]);
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
