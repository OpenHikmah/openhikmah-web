import { NextRequest, NextResponse } from "next/server";
import { and, eq, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { friendships, users } from "@/lib/db/schema";
import { requireUser } from "@/lib/social-auth";

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

  const [target] = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(eq(users.username, targetUsername))
    .limit(1);

  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (target.id === userId) {
    return NextResponse.json({ error: "Cannot add yourself" }, { status: 400 });
  }

  // Check for existing friendship in either direction
  const [existing] = await db
    .select({ id: friendships.id, status: friendships.status })
    .from(friendships)
    .where(
      or(
        and(eq(friendships.requesterId, userId), eq(friendships.addresseeId, target.id)),
        and(eq(friendships.requesterId, target.id), eq(friendships.addresseeId, userId))
      )
    )
    .limit(1);

  if (existing) {
    return NextResponse.json(
      { error: existing.status === "accepted" ? "Already friends" : "Request already sent" },
      { status: 409 }
    );
  }

  const [inserted] = await db
    .insert(friendships)
    .values({ requesterId: userId, addresseeId: target.id })
    .returning();

  return NextResponse.json({
    id: inserted.id,
    status: inserted.status,
    friend: { id: target.id, username: target.username },
  }, { status: 201 });
}
