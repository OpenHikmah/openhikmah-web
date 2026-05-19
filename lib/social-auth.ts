import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { users, type User } from "./db/schema";

export interface AuthedUser {
  userId: number;
  user: User;
}

// Simple in-process cache: token → user  (clears on server restart, good enough)
const tokenCache = new Map<string, { user: User; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

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

  // Check in-process cache first to avoid DB round-trip on every request
  const cached = tokenCache.get(token);
  if (cached && cached.expiresAt > Date.now()) {
    return { userId: cached.user.id, user: cached.user };
  }

  // Verify the token is valid by calling QF userinfo
  const qfId = await resolveQfId(token);
  if (!qfId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Look up (or create) the user in our DB
  const [user] = await db.select().from(users).where(eq(users.qfId, qfId)).limit(1);
  if (!user) {
    // User exists in QF but hasn't gone through our exchange route yet
    return NextResponse.json({ error: "Profile not found — please sign in again" }, { status: 401 });
  }

  tokenCache.set(token, { user, expiresAt: Date.now() + CACHE_TTL_MS });
  return { userId: user.id, user };
}

/**
 * Calls the QF userinfo endpoint and returns the stable `sub` (user ID),
 * or null if the token is invalid / the endpoint is unreachable.
 */
export async function resolveQfId(accessToken: string): Promise<string | null> {
  const qfAuthBase = process.env.QF_AUTH_BASE ?? "";
  if (!qfAuthBase) return null;

  // Try standard OIDC path first, fall back to QF-specific path
  const endpoints = [
    `${qfAuthBase}/oauth2/userinfo`,
    `${qfAuthBase}/auth/v1/me`,
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        // Short timeout — don't hang a request waiting for QF
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
