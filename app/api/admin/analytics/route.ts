import { NextRequest, NextResponse } from "next/server";
import { sql, gte, desc, and, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { db } from "@/lib/infra/db";
import { connections, users, searchLog } from "@/lib/infra/db/schema";

const TOP_LIMIT = 10;
const SEARCH_LOOKBACK_DAYS = 30;

type SectionKey =
  "topVerses" | "connectionsByKind" | "dau" | "popularSearches" | "zeroResultSearches";

const SECTION_COUNT = 5;

/** Unwraps a settled query result, recording a per-section error instead of failing the whole response. */
function settle<T>(
  result: PromiseSettledResult<T>,
  key: SectionKey,
  errors: Partial<Record<SectionKey, string>>,
  fallback: T
): T {
  if (result.status === "fulfilled") return result.value;
  console.error(`admin analytics GET db error (${key}):`, result.reason);
  errors[key] = "Failed to load";
  return fallback;
}

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

    const [topVersesR, connectionsByKindR, dauR, popularSearchesR, zeroResultSearchesR] =
      await Promise.allSettled([
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

    const errors: Partial<Record<SectionKey, string>> = {};
    const topVerses = settle(topVersesR, "topVerses", errors, []);
    const connectionsByKind = settle(connectionsByKindR, "connectionsByKind", errors, []);
    const dau = settle(dauR, "dau", errors, 0);
    const popularSearches = settle(popularSearchesR, "popularSearches", errors, []);
    const zeroResultSearches = settle(zeroResultSearchesR, "zeroResultSearches", errors, []);

    const body = {
      topVerses,
      connectionsByKind,
      dau,
      search: {
        lookbackDays: SEARCH_LOOKBACK_DAYS,
        popular: popularSearches,
        zeroResult: zeroResultSearches,
      },
      errors: Object.keys(errors).length ? errors : undefined,
    };

    // All 5 queries failing means the DB itself is unreachable/down, not a
    // one-off issue with a single query — surface that as a real outage
    // (so uptime/alerting keyed on status code still catches it) rather than
    // a 200 full of empty defaults.
    if (Object.keys(errors).length === SECTION_COUNT) {
      return NextResponse.json({ ...body, error: "All analytics queries failed" }, { status: 503 });
    }

    return NextResponse.json(body);
  } catch (err) {
    console.error("admin analytics GET db error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
