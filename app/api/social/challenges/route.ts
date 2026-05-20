import { NextRequest, NextResponse } from "next/server";
import { and, count, eq, gte, lt, lte, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { activityLog, challenges, friendships, users } from "@/lib/db/schema";
import { requireUser } from "@/lib/social-auth";
import type { Challenge } from "@/lib/db/schema";

const DURATIONS: Record<string, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "48h": 48 * 60 * 60 * 1000,
  "7d":  7 * 24 * 60 * 60 * 1000,
};

async function getScore(userId: number, challenge: Challenge): Promise<number> {
  const [row] = await db
    .select({ score: count() })
    .from(activityLog)
    .where(
      and(
        eq(activityLog.userId, userId),
        gte(activityLog.occurredAt, challenge.startsAt),
        lte(activityLog.occurredAt, challenge.endsAt)
      )
    );
  return row?.score ?? 0;
}

export async function GET(req: NextRequest) {
  const authed = await requireUser(req);
  if (authed instanceof NextResponse) return authed;
  const { userId } = authed;

  const rows = await db
    .select()
    .from(challenges)
    .where(
      or(
        eq(challenges.challengerId, userId),
        eq(challenges.challengedId, userId)
      )
    );

  const now = new Date();

  // Lazily resolve expired active challenges
  for (const c of rows) {
    if (c.status === "active" && c.endsAt < now) {
      const [challengerScore, challengedScore] = await Promise.all([
        getScore(c.challengerId, c),
        getScore(c.challengedId, c),
      ]);
      const winnerId =
        challengerScore > challengedScore ? c.challengerId :
        challengedScore > challengerScore ? c.challengedId :
        null;
      await db
        .update(challenges)
        .set({ status: "completed", winnerId })
        .where(eq(challenges.id, c.id));
      c.status = "completed";
      c.winnerId = winnerId;
    }
  }

  // Collect all user IDs to fetch usernames in one query
  const userIds = [...new Set(rows.flatMap((c) => [c.challengerId, c.challengedId]))];
  const userRows =
    userIds.length > 0
      ? await db
          .select({ id: users.id, username: users.username })
          .from(users)
          .where(or(...userIds.map((id) => eq(users.id, id))))
      : [];
  const userMap = new Map(userRows.map((u) => [u.id, u.username]));

  // Enrich with scores for active + completed challenges
  const enriched = await Promise.all(
    rows.map(async (c) => {
      const needsScores = c.status === "active" || c.status === "completed";
      const [challengerScore, challengedScore] = needsScores
        ? await Promise.all([getScore(c.challengerId, c), getScore(c.challengedId, c)])
        : [0, 0];
      return {
        ...c,
        challengerUsername: userMap.get(c.challengerId) ?? null,
        challengedUsername: userMap.get(c.challengedId) ?? null,
        challengerScore,
        challengedScore,
      };
    })
  );

  return NextResponse.json(enriched);
}

export async function POST(req: NextRequest) {
  const authed = await requireUser(req);
  if (authed instanceof NextResponse) return authed;
  const { userId } = authed;

  let body: { challengedUsername?: string; duration?: string; verseRef?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { challengedUsername, duration, verseRef } = body;
  if (!challengedUsername?.trim()) {
    return NextResponse.json({ error: "Missing challengedUsername" }, { status: 400 });
  }
  if (!duration || !DURATIONS[duration]) {
    return NextResponse.json({ error: "duration must be 24h, 48h, or 7d" }, { status: 400 });
  }

  const [target] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, challengedUsername.trim()))
    .limit(1);

  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (target.id === userId) {
    return NextResponse.json({ error: "Cannot challenge yourself" }, { status: 400 });
  }

  // Verify accepted friendship in either direction
  const [friendship] = await db
    .select({ id: friendships.id })
    .from(friendships)
    .where(
      and(
        or(
          and(eq(friendships.requesterId, userId), eq(friendships.addresseeId, target.id)),
          and(eq(friendships.requesterId, target.id), eq(friendships.addresseeId, userId))
        ),
        eq(friendships.status, "accepted")
      )
    )
    .limit(1);

  if (!friendship) {
    return NextResponse.json({ error: "You must be friends to send a challenge" }, { status: 409 });
  }

  // Block if an active or pending challenge already exists between them
  const [existing] = await db
    .select({ id: challenges.id })
    .from(challenges)
    .where(
      and(
        or(
          and(eq(challenges.challengerId, userId), eq(challenges.challengedId, target.id)),
          and(eq(challenges.challengerId, target.id), eq(challenges.challengedId, userId))
        ),
        or(eq(challenges.status, "pending"), eq(challenges.status, "active"))
      )
    )
    .limit(1);

  if (existing) {
    return NextResponse.json({ error: "A challenge already exists between you" }, { status: 409 });
  }

  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + DURATIONS[duration]);

  const [inserted] = await db
    .insert(challenges)
    .values({
      challengerId: userId,
      challengedId: target.id,
      verseRef: verseRef?.trim() || null,
      startsAt,
      endsAt,
    })
    .returning();

  // Probabilistic cleanup of very old declined/completed challenges (5%)
  if (Math.random() < 0.05) {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    db.delete(challenges)
      .where(
        and(
          or(eq(challenges.status, "completed"), eq(challenges.status, "declined")),
          lt(challenges.createdAt, cutoff)
        )
      )
      .catch(() => {});
  }

  return NextResponse.json(inserted, { status: 201 });
}
