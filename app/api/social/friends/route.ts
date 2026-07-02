import { NextRequest, NextResponse } from "next/server";
import { and, eq, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { friendships, users } from "@/lib/db/schema";
import { requireUser } from "@/lib/social-auth";
import { consume, MUTATION_LIMIT, MUTATION_WINDOW_SECONDS } from "@/lib/rate-limit";

/** Postgres unique-violation, possibly wrapped by the driver under `cause`. */
function isUniqueViolation(err: unknown): boolean {
  const code = (err as { code?: string })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
  return code === "23505";
}

export async function GET(req: NextRequest) {
  const authed = await requireUser(req);
  if (authed instanceof NextResponse) return authed;

  const { userId } = authed;

  const rows = await db
    .select({
      id: friendships.id,
      requesterId: friendships.requesterId,
      addresseeId: friendships.addresseeId,
      status: friendships.status,
      createdAt: friendships.createdAt,
      requesterUsername: users.username,
    })
    .from(friendships)
    .innerJoin(users, eq(users.id, friendships.requesterId))
    .where(
      or(
        eq(friendships.requesterId, userId),
        eq(friendships.addresseeId, userId)
      )
    )
    .limit(500);

  // Enrich with the friend's username (the other side)
  const friendIds = rows.map((r) =>
    r.requesterId === userId ? r.addresseeId : r.requesterId
  );

  const friendUsers =
    friendIds.length > 0
      ? await db
          .select({ id: users.id, username: users.username, currentStreak: users.currentStreak })
          .from(users)
          .where(
            friendIds.length === 1
              ? eq(users.id, friendIds[0])
              : or(...friendIds.map((id) => eq(users.id, id)))
          )
      : [];

  const friendMap = new Map(friendUsers.map((u) => [u.id, u]));

  const result = rows.map((r) => {
    const friendId = r.requesterId === userId ? r.addresseeId : r.requesterId;
    const friend = friendMap.get(friendId);
    return {
      id: r.id,
      status: r.status,
      direction: r.requesterId === userId ? "sent" : "received",
      friend: friend
        ? { id: friend.id, username: friend.username, streak: friend.currentStreak }
        : null,
      createdAt: r.createdAt,
    };
  });

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const authed = await requireUser(req);
  if (authed instanceof NextResponse) return authed;

  const allowed = await consume(`friend-req:${authed.userId}`, MUTATION_LIMIT, MUTATION_WINDOW_SECONDS);
  if (!allowed) {
    return NextResponse.json({ error: "Too many friend requests — try again later" }, { status: 429 });
  }

  let body: { username?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const targetUsername = body.username?.trim();
  if (!targetUsername) {
    return NextResponse.json({ error: "Missing username" }, { status: 400 });
  }

  const { userId } = authed;

  // Case-insensitive username match so "Alice" finds "alice".
  const [target] = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(sql`lower(${users.username}) = lower(${targetUsername})`)
    .limit(1);

  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (target.id === userId) {
    return NextResponse.json({ error: "Cannot add yourself" }, { status: 400 });
  }

  const friend = { id: target.id, username: target.username };

  // Check for an existing friendship in either direction
  const [existing] = await db
    .select({
      id: friendships.id,
      status: friendships.status,
      requesterId: friendships.requesterId,
    })
    .from(friendships)
    .where(
      or(
        and(eq(friendships.requesterId, userId), eq(friendships.addresseeId, target.id)),
        and(eq(friendships.requesterId, target.id), eq(friendships.addresseeId, userId))
      )
    )
    .limit(1);

  if (existing) {
    if (existing.status === "accepted") {
      return NextResponse.json({ error: "Already friends" }, { status: 409 });
    }
    if (existing.status === "pending") {
      // They already requested us — accept it instead of stacking a second row.
      if (existing.requesterId === target.id) {
        const [accepted] = await db
          .update(friendships)
          .set({ status: "accepted", updatedAt: new Date() })
          .where(eq(friendships.id, existing.id))
          .returning();
        return NextResponse.json({ id: accepted.id, status: accepted.status, friend, mutual: true });
      }
      return NextResponse.json({ error: "Request already sent" }, { status: 409 });
    }
    // A previously declined request — re-open it as a fresh outgoing request.
    const [reopened] = await db
      .update(friendships)
      .set({ requesterId: userId, addresseeId: target.id, status: "pending", updatedAt: new Date() })
      .where(eq(friendships.id, existing.id))
      .returning();
    return NextResponse.json({ id: reopened.id, status: reopened.status, friend }, { status: 201 });
  }

  try {
    const [inserted] = await db
      .insert(friendships)
      .values({ requesterId: userId, addresseeId: target.id })
      .returning();
    return NextResponse.json({ id: inserted.id, status: inserted.status, friend }, { status: 201 });
  } catch (err) {
    // A concurrent request inserted the same pair first — treat as already sent.
    if (isUniqueViolation(err)) {
      return NextResponse.json({ error: "Request already sent" }, { status: 409 });
    }
    throw err;
  }
}
