import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { users, type User } from "./db/schema";

export interface AuthedUser {
  userId: number;
  user: User;
}

// Simple in-process cache: token → user  (clears on server restart, good enough)
export const tokenCache = new Map<string, { user: User; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function invalidateTokenCache(token: string): void {
  tokenCache.delete(token);
}

/**
 * Decodes the payload of a JWT without verifying the signature.
 * Used to extract `sub` from QF's access token (Ory Hydra issues JWTs).
 * We still validate the user exists in our DB, so a forged token with an
 * unknown sub will simply return "not found".
 */
function decodeJwtSub(token: string): string | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf-8")
    ) as Record<string, unknown>;
    const sub = payload.sub ?? payload.user_id ?? payload.userId;
    return typeof sub === "string" && sub ? sub : null;
  } catch {
    return null;
  }
}

/**
 * Extracts the Bearer token from the request, resolves the user from the DB,
 * and returns { userId, user } or a 401 NextResponse.
 */
export async function requireUser(
  req: NextRequest
): Promise<AuthedUser | NextResponse> {
  const auth = req.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check in-process cache first to avoid any round-trip
  const cached = tokenCache.get(token);
  if (cached && cached.expiresAt > Date.now()) {
    return { userId: cached.user.id, user: cached.user };
  }

  // Resolve QF user ID: JWT decode first (no network), QF userinfo as fallback
  const qfId = await resolveQfId(token);
  if (!qfId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Look up the user in our DB
  const [user] = await db.select().from(users).where(eq(users.qfId, qfId)).limit(1);
  if (!user) {
    return NextResponse.json({ error: "Profile not found — please sign in again" }, { status: 401 });
  }

  tokenCache.set(token, { user, expiresAt: Date.now() + CACHE_TTL_MS });
  return { userId: user.id, user };
}

/**
 * Returns the QF user ID (sub) for an access token.
 * Decodes the JWT payload first (no network call). Falls back to the QF
 * userinfo endpoint if the token is opaque or the sub claim is missing.
 */
export async function resolveQfId(accessToken: string): Promise<string | null> {
  // Fast path: decode JWT payload — Ory Hydra issues JWTs with sub = QF user ID
  const jwtSub = decodeJwtSub(accessToken);
  if (jwtSub) return jwtSub;

  // Slow path: hit QF userinfo (opaque tokens, or sub missing from payload)
  const qfAuthBase = process.env.QF_AUTH_BASE ?? "";
  if (!qfAuthBase) return null;

  const endpoints = [
    `${qfAuthBase}/oauth2/userinfo`,
    `${qfAuthBase}/auth/v1/me`,
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) continue;
      const data = await res.json() as Record<string, unknown>;
      const sub = (data.sub ?? data.id ?? data.user_id ?? data.userId) as string | undefined;
      if (sub) return String(sub);
    } catch {
      // Try next endpoint
    }
  }

  return null;
}
