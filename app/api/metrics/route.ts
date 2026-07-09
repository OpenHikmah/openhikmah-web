import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/infra/db";
import { getRedis, redisEnabled } from "@/lib/infra/redis";
import { counterSnapshot, uptimeSeconds } from "@/lib/infra/metrics";

// Live probes must not be cached.
export const dynamic = "force-dynamic";

/** Pings Redis (when enabled) and reports reachability + round-trip latency. */
async function probeRedis(): Promise<{ enabled: boolean; ok?: boolean; latencyMs?: number }> {
  if (!redisEnabled()) return { enabled: false };
  const client = getRedis();
  if (!client) return { enabled: false };
  const start = Date.now();
  try {
    await client.ping();
    return { enabled: true, ok: true, latencyMs: Date.now() - start };
  } catch {
    return { enabled: true, ok: false };
  }
}

/** Runs a trivial query to confirm the database is reachable, with latency. */
async function probeDb(): Promise<{ ok: boolean; latencyMs?: number }> {
  const start = Date.now();
  try {
    await db.execute(sql`select 1`);
    return { ok: true, latencyMs: Date.now() - start };
  } catch {
    return { ok: false };
  }
}

/**
 * Lightweight observability surface: process uptime, Redis/DB reachability, and
 * the in-process counters (cache hit rates, rate-limit blocks, AI calls). Returns
 * JSON; intended to be scraped or eyeballed. Exposes no secrets or user data.
 */
export async function GET() {
  const [redis, database] = await Promise.all([probeRedis(), probeDb()]);
  return NextResponse.json({
    uptimeSeconds: uptimeSeconds(),
    redis,
    db: database,
    counters: counterSnapshot(),
  });
}
