import { NextRequest, NextResponse } from "next/server";
import { sql, gte, eq, isNotNull } from "drizzle-orm";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { db } from "@/lib/infra/db";
import { users, connections, curatedVotd, aiGenerations } from "@/lib/infra/db/schema";
import { redisEnabled, getRedis } from "@/lib/infra/redis";
import { votdDateKey } from "@/lib/quran/verse-of-day";

async function redisStatus(): Promise<"disabled" | "up" | "down"> {
  if (!redisEnabled()) return "disabled";
  try {
    const client = getRedis();
    if (!client) return "disabled";
    const pong = await client.ping();
    return pong === "PONG" ? "up" : "down";
  } catch {
    return "down";
  }
}

/** Dashboard snapshot for the Overview page. */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    // Start of the current UTC month, as the YYYY-MM-DD the timestamps compare against.
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const todayKey = votdDateKey(now);

    const [
      totalUsers,
      disabledUsers,
      totalConnections,
      flaggedConnections,
      curatedTotal,
      curatedUpcoming,
      aiAgg,
      redis,
    ] = await Promise.all([
      db.$count(users),
      db.$count(users, isNotNull(users.disabledAt)),
      db.$count(connections),
      db.$count(connections, eq(connections.status, "flagged")),
      db.$count(curatedVotd),
      db.$count(curatedVotd, gte(curatedVotd.date, todayKey)),
      db
        .select({
          gens: sql<number>`count(*)::int`,
          tokens: sql<number>`coalesce(sum(${aiGenerations.tokens}), 0)::int`,
        })
        .from(aiGenerations)
        .where(gte(aiGenerations.createdAt, monthStart)),
      redisStatus(),
    ]);

    return NextResponse.json({
      users: { total: totalUsers, disabled: disabledUsers },
      connections: { total: totalConnections, flagged: flaggedConnections },
      votd: { total: curatedTotal, upcoming: curatedUpcoming },
      aiMonthToDate: { generations: aiAgg[0]?.gens ?? 0, tokens: aiAgg[0]?.tokens ?? 0 },
      redis,
    });
  } catch (err) {
    console.error("admin overview GET db error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
