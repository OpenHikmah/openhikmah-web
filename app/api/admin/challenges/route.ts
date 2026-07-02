import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { challenges, users } from "@/lib/db/schema";
import { scoreChallenge, resolveEndedChallenges } from "@/lib/challenges";

const STATUSES = ["pending", "active", "completed", "declined", "cancelled"] as const;

/**
 * Admin challenges view: stats (counts by status) + a recent, enriched list
 * (usernames + live scores). Ended `active` challenges are finalized on read so
 * the admin always sees accurate state. `?status=` filters; `?limit=` caps.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const sp = req.nextUrl.searchParams;
  const status = sp.get("status");
  if (status && !(STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json({ error: "Invalid status filter" }, { status: 400 });
  }
  const limitParam = Number(sp.get("limit"));
  const limit = Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : 50;

  try {
    // Finalize any ended active challenges FIRST, so both the stats aggregation and
    // the returned list reflect the same (post-finalization) state.
    const now = new Date();
    const ended = await db
      .select()
      .from(challenges)
      .where(and(eq(challenges.status, "active"), lt(challenges.endsAt, now)));
    await resolveEndedChallenges(ended, now);

    // Stats: counts per status + suggestion-attributed total.
    const statusCounts = await db
      .select({ status: challenges.status, n: sql<number>`count(*)::int` })
      .from(challenges)
      .groupBy(challenges.status);
    const [{ fromSuggestions }] = await db
      .select({ fromSuggestions: sql<number>`count(*)::int` })
      .from(challenges)
      .where(sql`${challenges.suggestionId} is not null`);

    const stats = {
      byStatus: Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<string, number>,
      total: 0,
      fromSuggestions,
    };
    for (const r of statusCounts) {
      stats.byStatus[r.status] = r.n;
      stats.total += r.n;
    }

    // List (filtered, newest first), finalize any ended ones, then enrich.
    const rows = await db
      .select()
      .from(challenges)
      .where(status ? eq(challenges.status, status) : undefined)
      .orderBy(desc(challenges.createdAt))
      .limit(limit);

    const resolved = await resolveEndedChallenges(rows);

    const userIds = [...new Set(rows.flatMap((c) => [c.challengerId, c.challengedId]))];
    const userRows = userIds.length
      ? await db.select({ id: users.id, username: users.username }).from(users).where(inArray(users.id, userIds))
      : [];
    const userMap = new Map(userRows.map((u) => [u.id, u.username]));

    const list = await Promise.all(
      rows.map(async (c) => {
        const needsScores = c.status === "active" || c.status === "completed";
        const cached = resolved.get(c.id);
        const [challengerScore, challengedScore] = cached
          ? [cached.challengerScore, cached.challengedScore]
          : needsScores
            ? await Promise.all([scoreChallenge(c.challengerId, c), scoreChallenge(c.challengedId, c)])
            : [0, 0];
        return {
          ...c,
          challengerUsername: userMap.get(c.challengerId) ?? null,
          challengedUsername: userMap.get(c.challengedId) ?? null,
          challengerScore,
          challengedScore,
        };
      })
    );

    return NextResponse.json({ stats, challenges: list });
  } catch (err) {
    console.error("admin challenges GET db error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
