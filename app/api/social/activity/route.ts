import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/infra/db";
import { activityLog, users } from "@/lib/infra/db/schema";
import { requireUser, invalidateTokenCache } from "@/lib/auth/social-auth";
import {
  todayUTC,
  yesterdayUTC,
  previousDay,
  effectiveStreak,
  localDateFromOffset,
} from "@/lib/social/streak";
import { resolveActivityDate } from "@/lib/social/activity-date";
import { isValidRef } from "@/lib/quran/quran-corpus";
import { rateLimitOrNull, consume, MUTATION_WINDOW_SECONDS } from "@/lib/infra/rate-limit";

// Activity pings fire on ordinary reading (each verse/connection), so a genuinely
// engaged session can log far more than a typical "create a row" mutation —
// budget this route separately and higher than MUTATION_LIMIT.
const ACTIVITY_LIMIT = 300;

// Longest real ref is "114:6"; hadith_read carries a free-form id, so only verse_added is
// held to a canonical ref.
const MAX_VERSE_REF_LENGTH = 32;

const VALID_TYPES = new Set(["verse_added", "connection_made", "hadith_read"]);

// Widest real UTC offset is ±14h; allow a little slack for a client clock that's
// a bit off without letting a wildly-wrong clock fabricate consecutive days.
const MAX_TZ_OFFSET_MIN = 840;

// A user's first-ever offset (or one within this drift of their current
// anchor — DST shifts are 60min, some regions 30/45) is trusted immediately.
// A bigger jump claims a genuine relocation and is rate-limited below (see
// issue #563): without this, a client can flip its offset every request and
// walk the "local today" boundary back and forth to fabricate/preserve a
// streak that real activity never earned.
const ANCHOR_DRIFT_MINUTES = 60;
const ANCHOR_MOVE_LIMIT = 1;
const ANCHOR_MOVE_WINDOW_SECONDS = 20 * 60 * 60;

function isWithinDrift(offset: number, anchor: number): boolean {
  return Math.abs(offset - anchor) <= ANCHOR_DRIFT_MINUTES;
}

/**
 * Which offset to trust, decided against the *locked* anchor. First sight or
 * in-drift (DST) is trusted outright; a bigger jump only when this request
 * already spent an anchor-move limiter token on it. A request that looked
 * in-drift against the pre-tx snapshot but is a jump against the locked
 * anchor (a concurrent request moved it) has no token, so it falls back to
 * the locked anchor and persists nothing.
 */
function decideOffset(
  requested: number | null,
  anchor: number | null,
  jumpAllowed: boolean
): { trustedOffset: number | null; persistOffset: boolean } {
  if (requested === null) return { trustedOffset: anchor, persistOffset: false };
  if (anchor === null || isWithinDrift(requested, anchor) || jumpAllowed) {
    return { trustedOffset: requested, persistOffset: requested !== anchor };
  }
  return { trustedOffset: anchor, persistOffset: false };
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
  if (
    body.verse_ref !== undefined &&
    body.verse_ref !== null &&
    (typeof body.verse_ref !== "string" ||
      body.verse_ref.length > MAX_VERSE_REF_LENGTH ||
      (body.type === "verse_added" && !isValidRef(body.verse_ref)))
  ) {
    return NextResponse.json({ error: "Invalid verse_ref" }, { status: 400 });
  }
  const verseRef = body.verse_ref ?? null;
  const requestedOffset = tzOffsetMinutes;
  const localDate = body.local_date;

  const { userId } = authed;

  // A >ANCHOR_DRIFT_MINUTES jump claims a genuine relocation and must pass
  // the anchor-move limiter. consume() does external I/O (Redis, or a
  // Postgres write on its fallback path against the same pool the
  // transaction below draws from), so it runs here, against a plain unlocked
  // snapshot, rather than while holding the row lock. The snapshot only
  // decides whether to spend a limiter token; the actual trust decision is
  // re-made inside the transaction against the locked row (see
  // decideOffset), so concurrent requests can't each validate against an
  // anchor that's about to change (issue #633).
  let jumpAllowed = false;
  if (requestedOffset !== null) {
    try {
      const [currentUser] = await db
        .select({ timezoneOffsetMinutes: users.timezoneOffsetMinutes })
        .from(users)
        .where(eq(users.id, userId));
      const snapshotAnchor = currentUser?.timezoneOffsetMinutes ?? null;
      if (snapshotAnchor !== null && !isWithinDrift(requestedOffset, snapshotAnchor)) {
        const allowed = await consume(
          `tz-anchor:${userId}`,
          ANCHOR_MOVE_LIMIT,
          ANCHOR_MOVE_WINDOW_SECONDS
        );
        if (!allowed) {
          return NextResponse.json(
            { error: "Timezone changed too recently — please try again later." },
            { status: 400 }
          );
        }
        jumpAllowed = true;
      }
    } catch (err) {
      console.error("social/activity POST anchor-check error:", err);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  }

  try {
    // Insert + streak read/compute/write run in one transaction: the activity
    // event and the streak update must land together (a mid-flight failure
    // between two separate statements would otherwise log the activity
    // without updating the streak), and the user row is re-read with a row
    // lock here rather than trusting `authed.user` — that snapshot can be
    // cached, so two concurrent POSTs computing `newStreak` from the same
    // stale value would otherwise silently lose one of the increments. The
    // lock is taken first so the offset decision, the activity date, and the
    // writes all derive from the same locked anchor.
    const result = await db.transaction(async (tx) => {
      const [freshUser] = await tx.select().from(users).where(eq(users.id, userId)).for("update");
      if (!freshUser) throw new Error("user row missing during activity write");

      const { trustedOffset, persistOffset } = decideOffset(
        requestedOffset,
        freshUser.timezoneOffsetMinutes,
        jumpAllowed
      );
      const today = resolveActivityDate(localDate, trustedOffset);
      const yesterday = today === todayUTC() ? yesterdayUTC() : previousDay(today);

      await tx.insert(activityLog).values({
        userId,
        activityType,
        verseRef,
        activityDate: today,
      });

      const lastDate = freshUser.lastActivityDate; // "YYYY-MM-DD" or null
      let newStreak = freshUser.currentStreak;
      let newLongest = freshUser.longestStreak;
      let isNewDay = false;
      let didWrite = false;

      // `lastDate > today` happens when the anchor moved west (or the UTC
      // fallback applied) after a later-dated write; counting it as a new day
      // would reset the streak to 1, so treat it as already counted.
      if (lastDate !== null && lastDate >= today) {
        // Already counted today — no streak change. Still persist a
        // legitimate anchor set/move (see above) so later offset-only reads
        // (GET /me, leaderboard) decay against the user's current timezone.
        if (persistOffset) {
          await tx
            .update(users)
            .set({ timezoneOffsetMinutes: trustedOffset })
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
            ...(persistOffset ? { timezoneOffsetMinutes: trustedOffset } : {}),
          })
          .where(eq(users.id, userId));
        didWrite = true;
      }

      const streakBroken = isNewDay && lastDate !== null && lastDate !== yesterday;
      return { newStreak, newLongest, isNewDay, streakBroken, didWrite, today };
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
      streakBroken: result.streakBroken,
      activityDate: result.today,
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
    // The local calendar day `streak` was decayed against — see /api/social/me.
    streakDate: localDateFromOffset(user.timezoneOffsetMinutes),
  });
}
