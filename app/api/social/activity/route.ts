import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { activityLog, users } from "@/lib/db/schema";
import { requireUser, invalidateTokenCache } from "@/lib/social-auth";
import { todayUTC, yesterdayUTC, effectiveStreak } from "@/lib/streak";
import { rateLimitOrNull, MUTATION_WINDOW_SECONDS } from "@/lib/rate-limit";

// Activity pings fire on ordinary reading (each verse/connection), so a genuinely
// engaged session can log far more than a typical "create a row" mutation —
// budget this route separately and higher than MUTATION_LIMIT.
const ACTIVITY_LIMIT = 300;

const VALID_TYPES = new Set(["verse_added", "connection_made", "hadith_read"]);

export async function POST(req: NextRequest) {
  const authed = await requireUser(req);
  if (authed instanceof NextResponse) return authed;

  const limited = await rateLimitOrNull(
    `activity:${authed.userId}`,
    "Too many activity events — try again later",
    ACTIVITY_LIMIT,
    MUTATION_WINDOW_SECONDS
  );
  if (limited) return limited;

  let body: { type?: string; verse_ref?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!body.type || !VALID_TYPES.has(body.type)) {
    return NextResponse.json({ error: "Invalid activity type" }, { status: 400 });
  }
  // Narrow into locals: `body.type`'s non-undefined narrowing above doesn't
  // survive into the transaction closure below (TS can't prove `body` is
  // unmutated by the time the closure runs).
  const activityType = body.type;
  const verseRef = body.verse_ref ?? null;

  const { userId } = authed;
  const today = todayUTC();
  const yesterday = yesterdayUTC();

  try {
    // Insert + streak read/compute/write run in one transaction: the activity
    // event and the streak update must land together (a mid-flight failure
    // between two separate statements would otherwise log the activity without
    // updating the streak), and the user row is re-read with a row lock here
    // rather than trusting `authed.user` — that snapshot can be cached, so two
    // concurrent POSTs computing `newStreak` from the same stale value would
    // otherwise silently lose one of the increments.
    const result = await db.transaction(async (tx) => {
      await tx.insert(activityLog).values({
        userId,
        activityType,
        verseRef,
        activityDate: today,
      });

      const [freshUser] = await tx.select().from(users).where(eq(users.id, userId)).for("update");
      if (!freshUser) throw new Error("user row missing during activity write");

      const lastDate = freshUser.lastActivityDate; // "YYYY-MM-DD" or null
      let newStreak = freshUser.currentStreak;
      let newLongest = freshUser.longestStreak;
      let isNewDay = false;

      if (lastDate === today) {
        // Already counted today — no streak change
      } else {
        isNewDay = true;
        if (lastDate === yesterday) {
          // Consecutive day — extend streak
          newStreak = freshUser.currentStreak + 1;
        } else {
          // Gap or first ever — reset
          newStreak = 1;
        }
        newLongest = Math.max(newStreak, newLongest);

        await tx
          .update(users)
          .set({
            currentStreak: newStreak,
            longestStreak: newLongest,
            lastActivityDate: today,
            lastActiveAt: sql`now()`,
          })
          .where(eq(users.id, userId));
      }

      return { newStreak, newLongest, isNewDay, lastDate };
    });

    if (result.isNewDay) {
      // Invalidate cache so next request re-reads fresh streak from DB. Kept
      // outside the transaction — it's a best-effort cache flush, not part of
      // the consistency boundary.
      const rawAuth = req.headers.get("authorization");
      const token = rawAuth?.startsWith("Bearer ") ? rawAuth.slice(7) : null;
      if (token) invalidateTokenCache(token);
    }

    return NextResponse.json({
      streak: result.newStreak,
      longestStreak: result.newLongest,
      isNewDay: result.isNewDay,
      streakBroken: result.isNewDay && result.lastDate !== null && result.lastDate !== yesterday,
    });
  } catch (err) {
    console.error("social/activity POST db error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// GET: current streak for the logged-in user (used on page load to hydrate store)
export async function GET(req: NextRequest) {
  const authed = await requireUser(req);
  if (authed instanceof NextResponse) return authed;

  const { user } = authed;
  return NextResponse.json({
    streak: effectiveStreak(user.currentStreak, user.lastActivityDate),
    longestStreak: user.longestStreak,
    lastActivityDate: user.lastActivityDate,
  });
}
