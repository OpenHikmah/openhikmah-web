import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/infra/db";
import { activityLog, users } from "@/lib/infra/db/schema";
import { requireUser, invalidateTokenCache } from "@/lib/auth/social-auth";
import { todayUTC, yesterdayUTC, previousDay, effectiveStreak } from "@/lib/social/streak";
import { rateLimitOrNull, MUTATION_WINDOW_SECONDS } from "@/lib/infra/rate-limit";

// Activity pings fire on ordinary reading (each verse/connection), so a genuinely
// engaged session can log far more than a typical "create a row" mutation —
// budget this route separately and higher than MUTATION_LIMIT.
const ACTIVITY_LIMIT = 300;

const VALID_TYPES = new Set(["verse_added", "connection_made", "hadith_read"]);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Widest real UTC offset is ±14h; allow a little slack for a client clock that's
// a bit off without letting a wildly-wrong clock fabricate consecutive days.
const MAX_TZ_OFFSET_MIN = 840;

/**
 * The day to credit this activity to. Prefer the client's local calendar day so
 * streaks bucket by the user's midnight, not UTC — but clamp to the server's UTC
 * date if the client's date is more than ~26h away (a broken clock), so it can't
 * jump the streak forward or drop a day.
 */
function resolveActivityDate(localDate: string | undefined): string {
  const utc = todayUTC();
  if (!localDate || !DATE_RE.test(localDate)) return utc;
  const diffDays = Math.abs(
    (Date.parse(`${localDate}T00:00:00Z`) - Date.parse(`${utc}T00:00:00Z`)) / 86_400_000
  );
  return diffDays > 1 ? utc : localDate;
}

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

  let body: {
    type?: string;
    verse_ref?: string;
    local_date?: string;
    tz_offset_minutes?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!body.type || !VALID_TYPES.has(body.type)) {
    return NextResponse.json({ error: "Invalid activity type" }, { status: 400 });
  }

  let tzOffsetMinutes: number | null = null;
  if (body.tz_offset_minutes !== undefined) {
    if (
      !Number.isInteger(body.tz_offset_minutes) ||
      Math.abs(body.tz_offset_minutes) > MAX_TZ_OFFSET_MIN
    ) {
      return NextResponse.json({ error: "Invalid timezone offset" }, { status: 400 });
    }
    tzOffsetMinutes = body.tz_offset_minutes;
  }

  // Narrow into locals: `body.type`'s non-undefined narrowing above doesn't
  // survive into the transaction closure below (TS can't prove `body` is
  // unmutated by the time the closure runs).
  const activityType = body.type;
  const verseRef = body.verse_ref ?? null;

  const { userId } = authed;
  const today = resolveActivityDate(body.local_date);
  const yesterday = today === todayUTC() ? yesterdayUTC() : previousDay(today);

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
      let didWrite = false;

      if (lastDate === today) {
        // Already counted today — no streak change. Still refresh the stored
        // offset so later offset-only reads (GET /me, leaderboard) decay against
        // the user's current timezone.
        if (tzOffsetMinutes !== null && tzOffsetMinutes !== freshUser.timezoneOffsetMinutes) {
          await tx
            .update(users)
            .set({ timezoneOffsetMinutes: tzOffsetMinutes })
            .where(eq(users.id, userId));
          didWrite = true;
        }
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
            ...(tzOffsetMinutes !== null ? { timezoneOffsetMinutes: tzOffsetMinutes } : {}),
          })
          .where(eq(users.id, userId));
        didWrite = true;
      }

      return { newStreak, newLongest, isNewDay, lastDate, didWrite };
    });

    if (result.didWrite) {
      // Invalidate cache so next request re-reads the fresh streak/offset from
      // DB. Kept
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
      activityDate: today,
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
    streak: effectiveStreak(user.currentStreak, user.lastActivityDate, user.timezoneOffsetMinutes),
    longestStreak: user.longestStreak,
    lastActivityDate: user.lastActivityDate,
  });
}
