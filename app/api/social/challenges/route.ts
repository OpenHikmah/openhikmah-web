import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, gte, inArray, lt, or } from "drizzle-orm";
import { db } from "@/lib/infra/db";
import { challenges, challengeSuggestions, friendships, users } from "@/lib/infra/db/schema";
import { requireUser } from "@/lib/auth/social-auth";
import {
  DURATIONS,
  RESOLVE_CONCURRENCY,
  mapWithConcurrency,
  scoreChallenge,
  resolveEndedChallenges,
  resolveExpiredPending,
} from "@/lib/social/challenges";
import { rateLimitOrNull } from "@/lib/infra/rate-limit";

export async function GET(req: NextRequest) {
  const authed = await requireUser(req);
  if (authed instanceof NextResponse) return authed;
  const { userId } = authed;

  try {
    const now = new Date();

    // Single query for all expired challenges (active or pending) instead of two
    // separate SELECTs — halves the self-heal query overhead on every GET.
    const expired = await db
      .select()
      .from(challenges)
      .where(
        and(
          or(eq(challenges.challengerId, userId), eq(challenges.challengedId, userId)),
          inArray(challenges.status, ["active", "pending"]),
          lt(challenges.endsAt, now)
        )
      );

    const resolvedScores = await resolveEndedChallenges(
      expired.filter((c) => c.status === "active"),
      now
    );
    await resolveExpiredPending(
      expired.filter((c) => c.status === "pending"),
      now
    );

    // Bound the per-user challenge list for the response (newest first). 200 is far
    // above any real user's volume; statuses are current after the resolution above.
    const rows = await db
      .select()
      .from(challenges)
      .where(or(eq(challenges.challengerId, userId), eq(challenges.challengedId, userId)))
      .orderBy(desc(challenges.createdAt))
      .limit(200);

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

    // Build a complete scores map: cached from the self-heal above, plus freshly
    // computed for any active/completed challenge the self-heal didn't touch
    // (e.g. a challenge still in progress). Using mapWithConcurrency keeps the
    // round trips bounded instead of N*2 concurrent queries.
    const needsScoring = rows.filter(
      (c) =>
        (c.status === "active" || c.status === "completed") && !resolvedScores.has(c.id),
    );
    const computedScores = new Map<
      number,
      { challengerScore: number; challengedScore: number }
    >();
    if (needsScoring.length > 0) {
      await mapWithConcurrency(needsScoring, RESOLVE_CONCURRENCY, async (c) => {
        const [challengerScore, challengedScore] = await Promise.all([
          scoreChallenge(c.challengerId, c),
          scoreChallenge(c.challengedId, c),
        ]);
        computedScores.set(c.id, { challengerScore, challengedScore });
      });
    }
    const allScores = new Map([...resolvedScores, ...computedScores]);

    const enriched = rows.map((c) => {
      const s = allScores.get(c.id) ?? { challengerScore: 0, challengedScore: 0 };
      return {
        ...c,
        challengerUsername: userMap.get(c.challengerId) ?? null,
        challengedUsername: userMap.get(c.challengedId) ?? null,
        challengerScore: s.challengerScore,
        challengedScore: s.challengedScore,
      };
    });

    return NextResponse.json(enriched);
  } catch (err) {
    // Match the sibling list routes (bookmarks/workspace): never leak a stack trace.
    console.error("challenges GET db error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const authed = await requireUser(req);
  if (authed instanceof NextResponse) return authed;
  const { userId } = authed;

  const limited = await rateLimitOrNull(
    `challenge:${userId}`,
    "Too many challenges created — try again later"
  );
  if (limited) return limited;

  let body: {
    challengedUsername?: string;
    duration?: string;
    verseRef?: string;
    suggestionId?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { challengedUsername, duration, verseRef } = body;
  const suggestionCandidate =
    Number.isInteger(body.suggestionId) && (body.suggestionId as number) > 0
      ? (body.suggestionId as number)
      : null;
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

  // Block if an active or still-live pending challenge already exists between
  // them. A pending row whose endsAt has passed is a stale, un-actioned
  // invite — treat it as already expired here too, even if the lazy resolver
  // (GET) hasn't written the "declined" status back yet.
  const now = new Date();
  const [existing] = await db
    .select({ id: challenges.id })
    .from(challenges)
    .where(
      and(
        or(
          and(eq(challenges.challengerId, userId), eq(challenges.challengedId, target.id)),
          and(eq(challenges.challengerId, target.id), eq(challenges.challengedId, userId))
        ),
        or(
          eq(challenges.status, "active"),
          and(eq(challenges.status, "pending"), gte(challenges.endsAt, now))
        )
      )
    )
    .limit(1);

  if (existing) {
    return NextResponse.json({ error: "A challenge already exists between you" }, { status: 409 });
  }

  // Only attribute to a suggestion that actually exists and is active — an
  // arbitrary/stale id would otherwise fail the FK insert (or mis-attribute).
  let suggestionId: number | null = null;
  if (suggestionCandidate !== null) {
    const [s] = await db
      .select({ id: challengeSuggestions.id })
      .from(challengeSuggestions)
      .where(
        and(
          eq(challengeSuggestions.id, suggestionCandidate),
          eq(challengeSuggestions.isActive, true)
        )
      )
      .limit(1);
    suggestionId = s?.id ?? null;
  }

  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + DURATIONS[duration]);

  const [inserted] = await db
    .insert(challenges)
    .values({
      challengerId: userId,
      challengedId: target.id,
      verseRef: verseRef?.trim() || null,
      suggestionId,
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
