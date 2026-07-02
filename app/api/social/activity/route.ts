import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { activityLog, users } from "@/lib/db/schema";
import { requireUser, invalidateTokenCache } from "@/lib/social-auth";
import { todayUTC, yesterdayUTC, effectiveStreak } from "@/lib/streak";
import { consume, MUTATION_WINDOW_SECONDS } from "@/lib/rate-limit";

// Activity pings fire on ordinary reading (each verse/connection), so a genuinely
// engaged session can log far more than a typical "create a row" mutation —
// budget this route separately and higher than MUTATION_LIMIT.
const ACTIVITY_LIMIT = 300;

const VALID_TYPES = new Set(["verse_added", "connection_made", "hadith_read"]);

export async function POST(req: NextRequest) {
  const authed = await requireUser(req);
  if (authed instanceof NextResponse) return authed;

  const allowed = await consume(`activity:${authed.userId}`, ACTIVITY_LIMIT, MUTATION_WINDOW_SECONDS);
  if (!allowed) {
    return NextResponse.json({ error: "Too many activity events — try again later" }, { status: 429 });
  }

  let body: { type?: string; verse_ref?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!body.type || !VALID_TYPES.has(body.type)) {
    return NextResponse.json({ error: "Invalid activity type" }, { status: 400 });
  }

  const { userId, user } = authed;
  const today = todayUTC();
  const yesterday = yesterdayUTC();

  try {
    // Insert the activity event
    await db.insert(activityLog).values({
      userId,
      activityType: body.type,
      verseRef: body.verse_ref ?? null,
      activityDate: today,
    });

    // Compute new streak
    const lastDate = user.lastActivityDate; // "YYYY-MM-DD" or null
    let newStreak = user.currentStreak;
    let newLongest = user.longestStreak;
    let isNewDay = false;

    if (lastDate === today) {
      // Already counted today — no streak change
    } else {
      isNewDay = true;
      if (lastDate === yesterday) {
        // Consecutive day — extend streak
        newStreak = user.currentStreak + 1;
      } else {
        // Gap or first ever — reset
        newStreak = 1;
      }
      newLongest = Math.max(newStreak, newLongest);

      await db
        .update(users)
        .set({
          currentStreak: newStreak,
          longestStreak: newLongest,
          lastActivityDate: today,
          lastActiveAt: sql`now()`,
        })
        .where(eq(users.id, userId));

      // Invalidate cache so next request re-reads fresh streak from DB
      const rawAuth = req.headers.get("authorization");
      const token = rawAuth?.startsWith("Bearer ") ? rawAuth.slice(7) : null;
      if (token) invalidateTokenCache(token);
    }

    return NextResponse.json({
      streak: newStreak,
      longestStreak: newLongest,
      isNewDay,
      streakBroken: isNewDay && lastDate !== null && lastDate !== yesterday,
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
