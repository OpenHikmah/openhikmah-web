import { NextRequest, NextResponse } from "next/server";
import { and, eq, or } from "drizzle-orm";
import { db } from "@/lib/infra/db";
import { friendships, users } from "@/lib/infra/db/schema";
import { requireUser } from "@/lib/auth/social-auth";
import { effectiveStreak } from "@/lib/social/streak";

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

  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      currentStreak: users.currentStreak,
      longestStreak: users.longestStreak,
      lastActivityDate: users.lastActivityDate,
    })
    .from(users)
    .where(or(...allIds.map((id) => eq(users.id, id))))
    .limit(500);

  // Rank by the *effective* (decayed) streak so broken streaks don't sit at the
  // top stale, with deterministic tie-breakers: longest streak, then username.
  const ranked = rows
    .map((u) => ({ ...u, streak: effectiveStreak(u.currentStreak, u.lastActivityDate) }))
    .sort(
      (a, b) =>
        b.streak - a.streak ||
        b.longestStreak - a.longestStreak ||
        a.username.localeCompare(b.username)
    );

  return NextResponse.json(
    ranked.map((u, i) => ({
      rank: i + 1,
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      streak: u.streak,
      longestStreak: u.longestStreak,
      isYou: u.id === userId,
    }))
  );
}
