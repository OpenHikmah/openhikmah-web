import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { NextRequest } from "next/server";

// Real Postgres (Testcontainers). Reproduces issue #633 deterministically: a
// drift request's unlocked snapshot sees one anchor, then a concurrent
// transaction moves the anchor while this request waits on the row lock.

const { authedUser, mockConsume } = vi.hoisted(() => ({
  authedUser: { current: null as unknown },
  mockConsume: vi.fn(async () => true),
}));

vi.mock("@/lib/auth/social-auth", () => ({
  requireUser: vi.fn(async () => authedUser.current),
  invalidateTokenCache: vi.fn(),
}));
vi.mock("@/lib/infra/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/infra/rate-limit")>()),
  rateLimitOrNull: vi.fn(async () => null),
  consume: mockConsume,
}));

import { db } from "@/lib/infra/db";
import { activityLog, users } from "@/lib/infra/db/schema";
import { POST } from "@/app/api/social/activity/route";

beforeEach(async () => {
  await db.execute(sql`TRUNCATE users, activity_log RESTART IDENTITY CASCADE`);
  mockConsume.mockClear();
});

async function waitForLockWaiter() {
  for (let i = 0; i < 100; i++) {
    const rows = await db.execute(
      sql`SELECT 1 FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND datname = current_database()`
    );
    if (rows.length > 0) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("activity POST never blocked on the user row lock");
}

describe("POST /api/social/activity tz anchor race (issue #633, real Postgres)", () => {
  it("re-validates a drift against the anchor a concurrent request committed, not the stale snapshot", async () => {
    const [user] = await db
      .insert(users)
      .values({ qfId: "qf-race", username: "raceuser", timezoneOffsetMinutes: 0 })
      .returning();
    authedUser.current = { userId: user.id, user };

    let releaseLock!: () => void;
    const lockReleased = new Promise<void>((r) => (releaseLock = r));
    let lockHeld!: () => void;
    const lockAcquired = new Promise<void>((r) => (lockHeld = r));

    // Stands in for a concurrent request that locks the row first and moves
    // the anchor 0 -> +50 (in-drift for it).
    const concurrent = db.transaction(async (tx) => {
      await tx.select().from(users).where(eq(users.id, user.id)).for("update");
      lockHeld();
      await lockReleased;
      await tx.update(users).set({ timezoneOffsetMinutes: 50 }).where(eq(users.id, user.id));
    });
    await lockAcquired;

    const plus50Day = () => new Date(Date.now() + 50 * 60_000).toISOString().slice(0, 10);
    const dayBefore = plus50Day();
    // -50 is in-drift against the snapshot (0) but a 100-min jump against the
    // +50 it will see once it gets the lock.
    const pending = POST(
      new NextRequest("http://localhost/api/social/activity", {
        method: "POST",
        headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
        body: JSON.stringify({ type: "verse_added", tz_offset_minutes: -50 }),
      })
    );
    await waitForLockWaiter();
    releaseLock();
    await concurrent;

    const res = await pending;
    expect(res.status).toBe(200);
    expect(mockConsume).not.toHaveBeenCalled();

    const [after] = await db.select().from(users).where(eq(users.id, user.id));
    expect(after.timezoneOffsetMinutes).toBe(50);

    // The +50 local day can roll over while the request waits on the lock.
    const dayAfter = plus50Day();
    const [logged] = await db.select().from(activityLog).where(eq(activityLog.userId, user.id));
    expect([dayBefore, dayAfter]).toContain(logged.activityDate);
    expect((await res.json()).activityDate).toBe(logged.activityDate);
  });
});
