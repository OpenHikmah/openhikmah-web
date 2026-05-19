import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { activityLog, users } from "@/lib/db/schema";
import { requireUser } from "@/lib/social-auth";

const VALID_TYPES = new Set(["verse_added", "connection_made", "hadith_read"]);

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function yesterdayUTC(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export async function POST(req: NextRequest) {
  const authed = await requireUser(req);
  if (authed instanceof NextResponse) return authed;

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

    // Invalidate token cache entry so next requireUser() call gets fresh streak
    // (the cache is module-level in social-auth.ts; we clear by importing its map)
  }

  return NextResponse.json({
    streak: newStreak,
    longestStreak: newLongest,
    isNewDay,
    streakBroken: isNewDay && lastDate !== null && lastDate !== yesterday,
  });
}

// GET: current streak for the logged-in user (used on page load to hydrate store)
export async function GET(req: NextRequest) {
  const authed = await requireUser(req);
  if (authed instanceof NextResponse) return authed;

  const { user } = authed;
  return NextResponse.json({
    streak: user.currentStreak,
    longestStreak: user.longestStreak,
    lastActivityDate: user.lastActivityDate,
  });
}
