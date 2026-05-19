import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { friendships, users } from "@/lib/db/schema";
import { requireUser } from "@/lib/social-auth";

export async function GET(req: NextRequest) {
  const authed = await requireUser(req);
  if (authed instanceof NextResponse) return authed;

  const { userId } = authed;

  // Get all accepted friend IDs
  const friendRows = await db
    .select({
      requesterId: friendships.requesterId,
      addresseeId: friendships.addresseeId,
    })
    .from(friendships)
    .where(
      and(
        eq(friendships.status, "accepted"),
        or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId))
      )
    );

  const friendIds = friendRows.map((r) =>
    r.requesterId === userId ? r.addresseeId : r.requesterId
  );

  // Include self on leaderboard
  const allIds = [userId, ...friendIds];
  if (allIds.length === 0) return NextResponse.json([]);

  const leaderboard = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      currentStreak: users.currentStreak,
      longestStreak: users.longestStreak,
    })
    .from(users)
    .where(or(...allIds.map((id) => eq(users.id, id))))
    .orderBy(desc(users.currentStreak));

  return NextResponse.json(
    leaderboard.map((u, i) => ({
      rank: i + 1,
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      streak: u.currentStreak,
      longestStreak: u.longestStreak,
      isYou: u.id === userId,
    }))
  );
}
