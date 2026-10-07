import { and, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { QueryBuilder } from "drizzle-orm/pg-core";
import { db } from "@/lib/infra/db";
import { activityLog, challenges } from "@/lib/infra/db/schema";
import type { Challenge } from "@/lib/infra/db/schema";

/**
 * Shared challenge logic, extracted from the route handlers so it can be reused
 * by the user list endpoint, the admin force-resolve/finalize actions, and any
 * future cron — and unit-tested in isolation.
 */

/** Challenge window lengths, keyed by the duration token clients send. */
export const DURATIONS: Record<string, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "48h": 48 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};

export type DurationKey = "24h" | "48h" | "7d";

/** Whether a string is a valid duration token. Uses an explicit check rather
 *  than `in`/`hasOwnProperty` so inherited keys (e.g. "toString") never pass. */
export function isDuration(d: string): d is DurationKey {
  return d === "24h" || d === "48h" || d === "7d";
}

/**
 * Most activity_log rows of the challenge's type that count toward one
 * contestant's score per UTC day. Activity is reported by the client
 * (POST /api/social/activity), so challenges are honor-system: this cap only
 * bounds how much a scripted loop of pings can inflate a score, it does not
 * prove the activity happened. Generous enough that real use never reaches it.
 */
export const CHALLENGE_DAILY_SCORE_CAP = 100;

/**
 * Score for one contestant: matching activity_log rows within the challenge
 * window [startsAt, endsAt], each UTC day contributing at most
 * CHALLENGE_DAILY_SCORE_CAP. PG returns SUM as a bigint string, so we cast.
 */
export async function scoreChallenge(userId: number, challenge: Challenge): Promise<number> {
  // A detached query builder so the subquery isn't itself a `db.select()` call:
  // scoring stays exactly one round trip.
  const daily = new QueryBuilder()
    .select({ n: sql<number>`count(*)`.as("n") })
    .from(activityLog)
    .where(
      and(
        eq(activityLog.userId, userId),
        eq(activityLog.activityType, challenge.activityType),
        gte(activityLog.occurredAt, challenge.startsAt),
        lte(activityLog.occurredAt, challenge.endsAt)
      )
    )
    .groupBy(sql`date_trunc('day', ${activityLog.occurredAt} at time zone 'UTC')`)
    .as("daily");
  const [row] = await db
    .select({
      score: sql<number>`coalesce(sum(least(${daily.n}, ${CHALLENGE_DAILY_SCORE_CAP})), 0)`,
    })
    .from(daily);
  return Number(row?.score ?? 0);
}

export type ChallengeScores = { challengerScore: number; challengedScore: number };

/** Scores both contestants of a challenge. */
export async function scoreBoth(challenge: Challenge): Promise<ChallengeScores> {
  const [challengerScore, challengedScore] = await Promise.all([
    scoreChallenge(challenge.challengerId, challenge),
    scoreChallenge(challenge.challengedId, challenge),
  ]);
  return { challengerScore, challengedScore };
}

/**
 * Scores for display. A completed challenge reads its persisted final scores —
 * nothing is re-counted. A completed row from before the score columns existed
 * is scored once and persisted (guarded on the columns still being NULL, so a
 * concurrent reader can't clobber a value). An in-progress challenge has no final
 * score yet and is counted live.
 */
export async function scoresForDisplay(
  rows: Challenge[],
  alreadyScored: ResolvedScores = new Map()
): Promise<ResolvedScores> {
  const out: ResolvedScores = new Map(alreadyScored);
  const todo: Challenge[] = [];
  for (const c of rows) {
    if (out.has(c.id)) continue;
    if (c.status === "completed" && c.challengerScore !== null && c.challengedScore !== null) {
      out.set(c.id, { challengerScore: c.challengerScore, challengedScore: c.challengedScore });
    } else if (c.status === "active" || c.status === "completed") {
      todo.push(c);
    }
  }

  await mapWithConcurrency(todo, RESOLVE_CONCURRENCY, async (c) => {
    const scores = await scoreBoth(c);
    out.set(c.id, scores);
    if (c.status === "completed") {
      await db
        .update(challenges)
        .set(scores)
        .where(
          and(
            eq(challenges.id, c.id),
            eq(challenges.status, "completed"),
            isNull(challenges.challengerScore)
          )
        );
    }
  });
  return out;
}

/** The winner of a finished challenge, or null for a draw. */
export function pickWinner(
  challenge: Challenge,
  challengerScore: number,
  challengedScore: number
): number | null {
  if (challengerScore > challengedScore) return challenge.challengerId;
  if (challengedScore > challengerScore) return challenge.challengedId;
  return null;
}

export type ResolvedScores = Map<number, { challengerScore: number; challengedScore: number }>;

/**
 * Runs `fn` over `items` with at most `limit` calls in flight at once, instead
 * of either fully sequential (slow, one DB round trip at a time) or fully
 * unbounded `Promise.all` (which can fire hundreds of concurrent queries and
 * exhaust the DB connection pool on a large batch).
 */
export async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  let next = 0;
  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

export const RESOLVE_CONCURRENCY = 8;

/**
 * Finalize any `active` challenges in `rows` whose window has ended: compute both
 * scores, set the winner, flip status to `completed`, and persist. Mutates the
 * passed rows in place (status/winnerId) and returns a map of the scores it
 * computed so callers can avoid re-querying. This is the single place expiry is
 * resolved — the user GET route, the admin "finalize ended" action, and a future
 * cron all funnel through here.
 *
 * Each candidate still needs its own scoring + update (the winner differs per
 * row), so this can't collapse to one SQL statement — but processing runs with
 * bounded concurrency instead of one row at a time, so a burst of expired
 * challenges doesn't turn a single request into dozens of sequential round trips.
 */
export async function resolveEndedChallenges(
  rows: Challenge[],
  now: Date = new Date()
): Promise<ResolvedScores> {
  const resolved: ResolvedScores = new Map();
  const candidates = rows.filter((c) => c.status === "active" && c.endsAt < now);

  await mapWithConcurrency(candidates, RESOLVE_CONCURRENCY, async (c) => {
    const { challengerScore, challengedScore } = await scoreBoth(c);
    const winnerId = pickWinner(c, challengerScore, challengedScore);
    // Scope the write to the state just checked — a concurrent admin "end"
    // (or a second caller racing this same self-heal) may have already
    // transitioned this row; only count/mutate on an actual match instead
    // of unconditionally overwriting whatever it raced against.
    const [updated] = await db
      .update(challenges)
      .set({ status: "completed", winnerId, challengerScore, challengedScore })
      .where(and(eq(challenges.id, c.id), eq(challenges.status, "active")))
      .returning();
    if (updated) {
      c.status = "completed";
      c.winnerId = winnerId;
      c.challengerScore = challengerScore;
      c.challengedScore = challengedScore;
      resolved.set(c.id, { challengerScore, challengedScore });
    }
  });

  return resolved;
}

/**
 * Auto-expire `pending` invites nobody acted on. A pending challenge's
 * `endsAt` is stamped at creation time (before the competition window even
 * starts), so it doubles as the invite's expiry — past that point it's
 * declined automatically. Without this, an ignored invite blocks the pair
 * from ever creating a new challenge (see the "already exists between you"
 * check in POST), the same lazy-expiry gap `resolveEndedChallenges` closes
 * for `active` challenges. Mutates the passed rows in place (like its
 * sibling above) so callers see up-to-date status without re-querying.
 *
 * Unlike `resolveEndedChallenges`, every candidate here gets the exact same
 * write (`status: "declined"`), so this runs as a single bulk UPDATE instead
 * of one round trip per row.
 */
export async function resolveExpiredPending(
  rows: Challenge[],
  now: Date = new Date()
): Promise<number> {
  const candidates = rows.filter((c) => c.status === "pending" && c.endsAt < now);
  if (candidates.length === 0) return 0;

  // Scope the write the same way as resolveEndedChallenges above — if the pair
  // accepted/declined/cancelled an invite via the (already-guarded) PATCH route
  // in the window between our SELECT and this UPDATE, only still-pending rows
  // should be clobbered back to "declined".
  const ids = candidates.map((c) => c.id);
  const updated = await db
    .update(challenges)
    .set({ status: "declined" })
    .where(and(inArray(challenges.id, ids), eq(challenges.status, "pending")))
    .returning({ id: challenges.id });

  const updatedIds = new Set(updated.map((u) => u.id));
  for (const c of candidates) {
    if (updatedIds.has(c.id)) c.status = "declined";
  }
  return updated.length;
}
