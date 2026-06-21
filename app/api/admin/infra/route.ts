import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { logAdminAction } from "@/lib/admin-audit";
import { db } from "@/lib/db";
import { rateLimits } from "@/lib/db/schema";
import { redisEnabled, getRedis } from "@/lib/redis";
import { counterSnapshot, uptimeSeconds } from "@/lib/metrics";
import { tokenCache, clearTokenCache, clearJwksCache } from "@/lib/social-auth";

async function redisStatus(): Promise<"disabled" | "up" | "down"> {
  if (!redisEnabled()) return "disabled";
  try {
    const pong = await getRedis()?.ping();
    return pong === "PONG" ? "up" : "down";
  } catch {
    return "down";
  }
}

/** Infrastructure snapshot: process metrics, cache sizes, Redis + rate-limit state. */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const [redis, rateLimitRows] = await Promise.all([redisStatus(), db.$count(rateLimits)]);

  return NextResponse.json({
    redis,
    uptimeSeconds: uptimeSeconds(),
    tokenCacheSize: tokenCache.size,
    rateLimitRows,
    metrics: counterSnapshot(),
  });
}

const ACTIONS = ["flush-tokens", "flush-jwks", "reset-ratelimits"] as const;
type Action = (typeof ACTIONS)[number];

/** Run a maintenance action: body `{ action }`. */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  let body: { action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const action = body.action as Action | undefined;
  if (!action || !(ACTIONS as readonly string[]).includes(action)) {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  let result: Record<string, unknown> = {};
  switch (action) {
    case "flush-tokens": {
      result = { cleared: clearTokenCache() };
      break;
    }
    case "flush-jwks": {
      clearJwksCache();
      result = { ok: true };
      break;
    }
    case "reset-ratelimits": {
      const deleted = await db.delete(rateLimits).returning({ key: rateLimits.key });
      result = { deleted: deleted.length };
      break;
    }
  }

  await logAdminAction({
    adminQfId: auth.user.qfId,
    action: `infra.${action}`,
    targetType: "infra",
    meta: result,
  });

  return NextResponse.json({ action, ...result });
}
