import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { db } from "@/lib/infra/db";
import { friendships, users } from "@/lib/infra/db/schema";
import { requireUser } from "@/lib/auth/social-auth";
import { rateLimitOrNull } from "@/lib/infra/rate-limit";
import { isUniqueViolation, parsePagination } from "@/lib/infra/http";
import { effectiveStreak } from "@/lib/social/streak";

export async function GET(req: NextRequest) {
  const authed = await requireUser(req);
  if (authed instanceof NextResponse) return authed;

  const { userId } = authed;
  const { limit, offset } = parsePagination(req);

  // Fetch one extra row to detect `hasMore` without a separate count query.
  const rows = await db
    .select({
      id: friendships.id,
      requesterId: friendships.requesterId,
      addresseeId: friendships.addresseeId,
      status: friendships.status,
      createdAt: friendships.createdAt,
    })
    .from(friendships)
    .where(or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId)))
    .orderBy(desc(friendships.createdAt))
    .limit(limit + 1)
    .offset(offset);

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);

  // Enrich with the friend's username (the other side)
  const friendIds = page.map((r) => (r.requesterId === userId ? r.addresseeId : r.requesterId));

  const friendUsers =
    friendIds.length > 0
      ? await db
          .select({
            id: users.id,
            username: users.username,
            currentStreak: users.currentStreak,
            lastActivityDate: users.lastActivityDate,
            timezoneOffsetMinutes: users.timezoneOffsetMinutes,
          })
          .from(users)
          .where(
            friendIds.length === 1
              ? eq(users.id, friendIds[0])
              : or(...friendIds.map((id) => eq(users.id, id)))
          )
      : [];

  const friendMap = new Map(friendUsers.map((u) => [u.id, u]));

  const items = page.map((r) => {
    const friendId = r.requesterId === userId ? r.addresseeId : r.requesterId;
    const friend = friendMap.get(friendId);
    return {
      id: r.id,
      status: r.status,
      direction: r.requesterId === userId ? "sent" : "received",
      friend: friend
        ? {
            id: friend.id,
            username: friend.username,
            streak: effectiveStreak(
              friend.currentStreak,
              friend.lastActivityDate,
              friend.timezoneOffsetMinutes
            ),
          }
        : null,
      createdAt: r.createdAt,
    };
  });

  return NextResponse.json({ items, hasMore });
}

export async function POST(req: NextRequest) {
  const authed = await requireUser(req);
  if (authed instanceof NextResponse) return authed;

  const limited = await rateLimitOrNull(
    `friend-req:${authed.userId}`,
    "Too many friend requests — try again later"
  );
  if (limited) return limited;

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

  // The pair can change under us (the other side's request, a decline, a delete),
  // so each step below is conditional and the whole check-then-act is retried a
  // couple of times against fresh state instead of assuming the first read held.
  for (let attempt = 0; attempt < 3; attempt++) {
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
        if (existing.requesterId !== target.id) {
          return NextResponse.json({ error: "Request already sent" }, { status: 409 });
        }
        // They already requested us — accept it instead of stacking a second row.
        // Guarded on still-pending: if they cancelled or it was resolved since the
        // read, nothing matches and we re-read rather than dereference a missing row.
        const [accepted] = await db
          .update(friendships)
          .set({ status: "accepted", updatedAt: new Date() })
          .where(and(eq(friendships.id, existing.id), eq(friendships.status, "pending")))
          .returning();
        if (!accepted) continue;
        return NextResponse.json({
          id: accepted.id,
          status: accepted.status,
          friend,
          mutual: true,
        });
      }
      // A "declined" row here is historical data from before declines were
      // deleted outright (see PATCH .../[friendId]) — remove it first so it
      // can't collide with the unique pair index below; a fresh request should
      // behave identically to a first-time request.
      await db.delete(friendships).where(eq(friendships.id, existing.id));
    }

    try {
      const [inserted] = await db
        .insert(friendships)
        .values({ requesterId: userId, addresseeId: target.id })
        .returning();
      return NextResponse.json(
        { id: inserted.id, status: inserted.status, friend },
        { status: 201 }
      );
    } catch (err) {
      // The unique pair index is on the UNORDERED pair, so a concurrent request in
      // either direction lands here. Re-read: if it was the opposite direction it
      // is auto-accepted above, if it was ours it is "already sent".
      if (!isUniqueViolation(err)) throw err;
    }
  }
  return NextResponse.json({ error: "Request already sent" }, { status: 409 });
}
