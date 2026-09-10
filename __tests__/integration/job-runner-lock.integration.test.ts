import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import { EventEmitter } from "node:events";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import { db } from "@/lib/infra/db";
import { JOB_LOCK_KEY } from "@/lib/admin/job-lock";

// The runner spawns `bun scripts/<name>.mjs` for script jobs — irrelevant to the
// lock behaviour under test, so stub it with an EventEmitter we can "close".
class FakeChild extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
}
const { mockSpawn, lastChild } = vi.hoisted(() => ({
  mockSpawn: vi.fn(),
  lastChild: { current: null as FakeChild | null },
}));
vi.mock("node:child_process", () => ({ spawn: mockSpawn, default: { spawn: mockSpawn } }));
vi.mock("@/lib/ai/connection-batch", () => ({ runConnectionBatch: vi.fn() }));
vi.mock("@/lib/ai/connection-batch-loop", () => ({ runConnectionBatchLoop: vi.fn() }));

import { startJob } from "@/lib/admin/job-runner";

// A second connection standing in for "another app process".
const outsider = postgres(process.env.DATABASE_URL as string, { max: 1 });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeEach(async () => {
  mockSpawn.mockReset().mockImplementation(() => {
    const child = new FakeChild();
    lastChild.current = child;
    return child;
  });
  await db.execute(sql`TRUNCATE job_runs RESTART IDENTITY`);
});

afterEach(async () => {
  // Close out whatever the test started so the runner's in-memory guard and the
  // advisory lock are both released before the next test.
  lastChild.current?.emit("close", 0);
  lastChild.current = null;
  await sleep(20);
});

afterAll(async () => {
  await outsider.end();
});

describe("job-runner advisory lock (integration, real Postgres)", () => {
  it("refuses to start when another connection holds the lock, and writes no job_runs row", async () => {
    const [{ locked }] = await outsider<{ locked: boolean }[]>`
      select pg_try_advisory_lock(${JOB_LOCK_KEY}) as locked
    `;
    expect(locked).toBe(true);

    await expect(startJob("seed-quran", "qf-admin")).rejects.toThrow(/already running/);

    const rows = await db.execute<{ n: number }>(sql`select count(*)::int as n from job_runs`);
    expect(rows[0].n).toBe(0);
    expect(mockSpawn).not.toHaveBeenCalled();

    await outsider`select pg_advisory_unlock(${JOB_LOCK_KEY})`;
  });

  it("holds the lock for the duration of a run and releases it on completion", async () => {
    await startJob("seed-quran", "qf-admin");

    // While the job runs, an outside process cannot take the lock.
    const [mid] = await outsider<{ locked: boolean }[]>`
      select pg_try_advisory_lock(${JOB_LOCK_KEY}) as locked
    `;
    expect(mid.locked).toBe(false);

    // Job finishes → runner releases the lock.
    lastChild.current?.emit("close", 0);
    lastChild.current = null;
    await sleep(50);

    const [after] = await outsider<{ locked: boolean }[]>`
      select pg_try_advisory_lock(${JOB_LOCK_KEY}) as locked
    `;
    expect(after.locked).toBe(true);
    await outsider`select pg_advisory_unlock(${JOB_LOCK_KEY})`;
  });

  it("lets the next job start once the lock has been released", async () => {
    await startJob("seed-quran", "qf-admin");
    lastChild.current?.emit("close", 0);
    lastChild.current = null;
    await sleep(50);

    const { runId } = await startJob("seed-morphology", "qf-admin");
    expect(runId).toBeTypeOf("number");
    const rows = await db.execute<{ n: number }>(sql`select count(*)::int as n from job_runs`);
    expect(rows[0].n).toBe(2);
  });
});
