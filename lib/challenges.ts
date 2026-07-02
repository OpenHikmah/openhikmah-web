import { and, count, eq, gte, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { activityLog, challenges } from "@/lib/db/schema";
import type { Challenge } from "@/lib/db/schema";

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
 * Score for one contestant: the number of matching activity_log rows within the
 * challenge window [startsAt, endsAt]. PG returns COUNT as a bigint string, so
 * we cast to number.
 */
export async function scoreChallenge(userId: number, challenge: Challenge): Promise<number> {
  const [row] = await db
    .select({ score: count() })
    .from(activityLog)
    .where(
      and(
        eq(activityLog.userId, userId),
        eq(activityLog.activityType, challenge.activityType),
        gte(activityLog.occurredAt, challenge.startsAt),
        lte(activityLog.occurredAt, challenge.endsAt)
      )
    );
  return Number(row?.score ?? 0);
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
 * Finalize any `active` challenges in `rows` whose window has ended: compute both
 * scores, set the winner, flip status to `completed`, and persist. Mutates the
 * passed rows in place (status/winnerId) and returns a map of the scores it
 * computed so callers can avoid re-querying. This is the single place expiry is
 * resolved — the user GET route, the admin "finalize ended" action, and a future
 * cron all funnel through here.
 */
export async function resolveEndedChallenges(
  rows: Challenge[],
  now: Date = new Date()
): Promise<ResolvedScores> {
  const resolved: ResolvedScores = new Map();
  for (const c of rows) {
    if (c.status === "active" && c.endsAt < now) {
      const [challengerScore, challengedScore] = await Promise.all([
        scoreChallenge(c.challengerId, c),
        scoreChallenge(c.challengedId, c),
      ]);
      const winnerId = pickWinner(c, challengerScore, challengedScore);
      await db
        .update(challenges)
        .set({ status: "completed", winnerId })
        .where(eq(challenges.id, c.id));
      c.status = "completed";
      c.winnerId = winnerId;
      resolved.set(c.id, { challengerScore, challengedScore });
    }
  }
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
 */
export async function resolveExpiredPending(
  rows: Challenge[],
  now: Date = new Date()
): Promise<number> {
  let resolvedCount = 0;
  for (const c of rows) {
    if (c.status === "pending" && c.endsAt < now) {
      await db.update(challenges).set({ status: "declined" }).where(eq(challenges.id, c.id));
      c.status = "declined";
      resolvedCount++;
    }
  }
  return resolvedCount;
}
