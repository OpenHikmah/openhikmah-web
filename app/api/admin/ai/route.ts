import { NextRequest, NextResponse } from "next/server";
import { sql, gte } from "drizzle-orm";
import { requireAdmin } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { aiGenerations } from "@/lib/db/schema";

/**
 * AI generation cost/usage aggregates. Tokens are the real signal (one row per
 * actual generation / cache miss). A dollar estimate is derived only when
 * `AI_USD_PER_1K_TOKENS` is configured — we never fabricate a price.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const since30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [totals, monthTotals, byModel, byKind, daily] = await Promise.all([
    db
      .select({
        gens: sql<number>`count(*)::int`,
        tokens: sql<number>`coalesce(sum(${aiGenerations.tokens}),0)::int`,
      })
      .from(aiGenerations),
    db
      .select({
        gens: sql<number>`count(*)::int`,
        tokens: sql<number>`coalesce(sum(${aiGenerations.tokens}),0)::int`,
      })
      .from(aiGenerations)
      .where(gte(aiGenerations.createdAt, monthStart)),
    db
      .select({
        model: sql<string>`coalesce(${aiGenerations.model}, 'unknown')`,
        gens: sql<number>`count(*)::int`,
        tokens: sql<number>`coalesce(sum(${aiGenerations.tokens}),0)::int`,
      })
      .from(aiGenerations)
      .groupBy(sql`coalesce(${aiGenerations.model}, 'unknown')`),
    db
      .select({
        kind: aiGenerations.kind,
        gens: sql<number>`count(*)::int`,
        tokens: sql<number>`coalesce(sum(${aiGenerations.tokens}),0)::int`,
      })
      .from(aiGenerations)
      .groupBy(aiGenerations.kind),
    db
      .select({
        day: sql<string>`to_char(${aiGenerations.createdAt}, 'YYYY-MM-DD')`,
        gens: sql<number>`count(*)::int`,
        tokens: sql<number>`coalesce(sum(${aiGenerations.tokens}),0)::int`,
      })
      .from(aiGenerations)
      .where(gte(aiGenerations.createdAt, since30))
      .groupBy(sql`to_char(${aiGenerations.createdAt}, 'YYYY-MM-DD')`)
      .orderBy(sql`to_char(${aiGenerations.createdAt}, 'YYYY-MM-DD')`),
  ]);

  // Preserve a configured 0 (free tier) as a real price; only a missing/invalid
  // value is treated as "unset" (null) — the UI keys on `=== null` to decide.
  const rawPrice = process.env.AI_USD_PER_1K_TOKENS;
  const parsed = rawPrice == null || rawPrice.trim() === "" ? NaN : Number(rawPrice);
  const pricePer1k = Number.isFinite(parsed) ? parsed : null;
  const estCost = (tokens: number) =>
    pricePer1k !== null ? Number(((tokens / 1000) * pricePer1k).toFixed(2)) : null;

  return NextResponse.json({
    total: { ...totals[0], estCostUsd: estCost(totals[0]?.tokens ?? 0) },
    monthToDate: { ...monthTotals[0], estCostUsd: estCost(monthTotals[0]?.tokens ?? 0) },
    byModel,
    byKind,
    daily,
    pricePer1k,
  });
}
