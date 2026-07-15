import { NextRequest, NextResponse } from "next/server";
import { sql, gte, desc, and, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { db } from "@/lib/infra/db";
import { connections, users, searchLog } from "@/lib/infra/db/schema";

const TOP_LIMIT = 10;
const SEARCH_LOOKBACK_DAYS = 30;

/**
 * Product-usage analytics for the admin panel: top verses explored, connection
 * volume by kind, DAU, and popular / zero-result search queries. Distinct from
 * `admin/overview` (lifetime counts + AI cost) and `admin/infra` (process/cache
 * health) — this is the "what are people actually doing" view.
 *
 * Audio plays are not tracked anywhere in the app yet (no instrumentation
 * exists), so that metric from the original request is intentionally omitted
 * rather than faked — a future PR can add it once a play event exists.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const now = new Date();
    const todayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    );
    const searchSince = new Date(now.getTime() - SEARCH_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

    const [topVerses, connectionsByKind, dau, popularSearches, zeroResultSearches] =
      await Promise.all([
        // "Verses explored": the from-verse of every generated connection is the
        // verse a user expanded in the canvas (connections are only written on a
        // cache miss triggered by expansion) — the cheapest accurate proxy without
        // adding a new event type.
        db
          .select({ fromRef: connections.fromRef, count: sql<number>`count(*)::int` })
          .from(connections)
          .groupBy(connections.fromRef)
          .orderBy(desc(sql`count(*)`))
          .limit(TOP_LIMIT),
        db
          .select({ kind: connections.kind, count: sql<number>`count(*)::int` })
          .from(connections)
          .groupBy(connections.kind)
          .orderBy(desc(sql`count(*)`)),
        db.$count(users, gte(users.lastActiveAt, todayStart)),
        db
          .select({ query: searchLog.query, count: sql<number>`count(*)::int` })
          .from(searchLog)
          .where(gte(searchLog.createdAt, searchSince))
          .groupBy(searchLog.query)
          .orderBy(desc(sql`count(*)`))
          .limit(TOP_LIMIT),
        db
          .select({ query: searchLog.query, count: sql<number>`count(*)::int` })
          .from(searchLog)
          .where(and(eq(searchLog.zeroResult, true), gte(searchLog.createdAt, searchSince)))
          .groupBy(searchLog.query)
          .orderBy(desc(sql`count(*)`))
          .limit(TOP_LIMIT),
      ]);

    return NextResponse.json({
      topVerses,
      connectionsByKind,
      dau,
      search: {
        lookbackDays: SEARCH_LOOKBACK_DAYS,
        popular: popularSearches,
        zeroResult: zeroResultSearches,
      },
    });
  } catch (err) {
    console.error("admin analytics GET db error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
