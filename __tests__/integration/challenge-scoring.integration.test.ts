import { describe, it, expect, beforeEach } from "vitest";
import { eq, sql } from "drizzle-orm";

// Real Postgres (Testcontainers): the per-day score cap is SQL, so it is only
// meaningfully tested against a real database.

import { db } from "@/lib/infra/db";
import { activityLog, challenges, users } from "@/lib/infra/db/schema";
import {
  CHALLENGE_DAILY_SCORE_CAP,
  resolveEndedChallenges,
  scoreChallenge,
  scoresForDisplay,
} from "@/lib/social/challenges";

const DAY = 24 * 60 * 60 * 1000;

beforeEach(async () => {
  await db.execute(sql`TRUNCATE users, activity_log, challenges RESTART IDENTITY CASCADE`);
});

async function twoUsers() {
  const [a, b] = await db
    .insert(users)
    .values([
      { qfId: "qf-a", username: "alice" },
      { qfId: "qf-b", username: "bob" },
    ])
    .returning();
  return { a, b };
}

async function logActivity(userId: number, at: Date, n: number, type = "connection_made") {
  await db.insert(activityLog).values(
    Array.from({ length: n }, () => ({
      userId,
      activityType: type,
      activityDate: at.toISOString().slice(0, 10),
      occurredAt: at,
    }))
  );
}

async function makeChallenge(
  challengerId: number,
  challengedId: number,
  startsAt: Date,
  endsAt: Date
) {
  const [c] = await db
    .insert(challenges)
    .values({ challengerId, challengedId, status: "active", startsAt, endsAt })
    .returning();
  return c;
}

describe("challenge scoring (real Postgres)", () => {
  it("counts activity inside the window and ignores other types, users and times", async () => {
    const { a, b } = await twoUsers();
    const start = new Date("2026-03-10T00:00:00Z");
    const c = await makeChallenge(a.id, b.id, start, new Date(start.getTime() + 2 * DAY));
    await logActivity(a.id, new Date("2026-03-10T10:00:00Z"), 3);
    await logActivity(a.id, new Date("2026-03-10T11:00:00Z"), 2, "verse_added");
    await logActivity(a.id, new Date("2026-03-09T23:00:00Z"), 4);
    await logActivity(b.id, new Date("2026-03-10T10:00:00Z"), 7);

    expect(await scoreChallenge(a.id, c)).toBe(3);
    expect(await scoreChallenge(b.id, c)).toBe(7);
  });

  it("scores 0 when there is no activity", async () => {
    const { a, b } = await twoUsers();
    const start = new Date("2026-03-10T00:00:00Z");
    const c = await makeChallenge(a.id, b.id, start, new Date(start.getTime() + DAY));
    expect(await scoreChallenge(a.id, c)).toBe(0);
  });

  it("caps each UTC day at CHALLENGE_DAILY_SCORE_CAP, so a scripted burst cannot run away", async () => {
    const { a, b } = await twoUsers();
    const start = new Date("2026-03-10T00:00:00Z");
    const c = await makeChallenge(a.id, b.id, start, new Date(start.getTime() + 3 * DAY));
    await logActivity(a.id, new Date("2026-03-10T10:00:00Z"), CHALLENGE_DAILY_SCORE_CAP + 150);
    await logActivity(a.id, new Date("2026-03-11T10:00:00Z"), 10);
    await logActivity(a.id, new Date("2026-03-12T10:00:00Z"), CHALLENGE_DAILY_SCORE_CAP * 3);

    expect(await scoreChallenge(a.id, c)).toBe(
      CHALLENGE_DAILY_SCORE_CAP + 10 + CHALLENGE_DAILY_SCORE_CAP
    );
  });

  it("persists final scores at completion and later reads return them without re-counting", async () => {
    const { a, b } = await twoUsers();
    const start = new Date(Date.now() - 3 * DAY);
    const end = new Date(Date.now() - DAY);
    const c = await makeChallenge(a.id, b.id, start, end);
    await logActivity(a.id, new Date(start.getTime() + 1000), 5);
    await logActivity(b.id, new Date(start.getTime() + 1000), 2);

    await resolveEndedChallenges([c]);
    const [done] = await db.select().from(challenges).where(eq(challenges.id, c.id));
    expect(done).toMatchObject({
      status: "completed",
      winnerId: a.id,
      challengerScore: 5,
      challengedScore: 2,
    });

    // Activity logged afterwards (or deleted) must not change a finished result.
    await db.delete(activityLog);
    const scores = await scoresForDisplay([done]);
    expect(scores.get(c.id)).toEqual({ challengerScore: 5, challengedScore: 2 });
  });

  it("fills in a legacy completed challenge's NULL scores once", async () => {
    const { a, b } = await twoUsers();
    const start = new Date(Date.now() - 3 * DAY);
    const [legacy] = await db
      .insert(challenges)
      .values({
        challengerId: a.id,
        challengedId: b.id,
        status: "completed",
        winnerId: a.id,
        startsAt: start,
        endsAt: new Date(Date.now() - DAY),
      })
      .returning();
    await logActivity(a.id, new Date(start.getTime() + 1000), 4);

    const first = await scoresForDisplay([legacy]);
    expect(first.get(legacy.id)).toEqual({ challengerScore: 4, challengedScore: 0 });
    const [stored] = await db.select().from(challenges).where(eq(challenges.id, legacy.id));
    expect(stored).toMatchObject({ challengerScore: 4, challengedScore: 0 });

    await logActivity(a.id, new Date(start.getTime() + 2000), 3);
    const second = await scoresForDisplay([stored]);
    expect(second.get(legacy.id)).toEqual({ challengerScore: 4, challengedScore: 0 });
  });
});
