import { NextRequest, NextResponse } from "next/server";
import { createPublicKey, verify as verifySignature } from "node:crypto";
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

// ─── JWT signature verification ───────────────────────────────────────────────
// QF runs Ory Hydra, which issues RS256-signed JWT access tokens. We verify the
// signature against QF's published JWKS before trusting any claim — an attacker
// must NEVER be able to authenticate by hand-crafting a token with a known `sub`.
// If verification can't be performed (JWKS unreachable, opaque token, unknown
// alg), we return null and the caller falls back to the QF userinfo endpoint,
// which is authoritative — so a tampered token is rejected there too.

interface Jwk {
  kty: string;
  kid?: string;
  alg?: string;
  use?: string;
  n?: string;
  e?: string;
}

let jwksCache: { keys: Jwk[]; expiresAt: number } | null = null;
const JWKS_TTL_MS = 60 * 60 * 1000; // 1 hour

/** Candidate JWKS URLs. `QF_JWKS_URL` overrides; otherwise derive from the auth base. */
function jwksUrls(): string[] {
  const explicit = process.env.QF_JWKS_URL;
  if (explicit) return [explicit];
  const base = process.env.QF_AUTH_BASE ?? "";
  if (!base) return [];
  return [`${base}/.well-known/jwks.json`, `${base}/oauth2/.well-known/jwks.json`];
}

async function fetchJwks(): Promise<Jwk[]> {
  if (jwksCache && jwksCache.expiresAt > Date.now()) return jwksCache.keys;
  for (const url of jwksUrls()) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) continue;
      const data = (await res.json()) as { keys?: Jwk[] };
      if (Array.isArray(data.keys) && data.keys.length > 0) {
        jwksCache = { keys: data.keys, expiresAt: Date.now() + JWKS_TTL_MS };
        return data.keys;
      }
    } catch {
      // Try the next candidate URL.
    }
  }
  return [];
}

function b64urlToBuffer(s: string): Buffer {
  return Buffer.from(s, "base64url");
}

/**
 * Returns the `sub` of a QF access token ONLY if it is a JWT whose RS256
 * signature verifies against QF's JWKS and which has not expired. Returns null
 * for opaque tokens, unknown algorithms, bad signatures, expired tokens, or when
 * the JWKS can't be fetched — every one of those falls back to the authoritative
 * userinfo path, so this never weakens auth, it only adds a verified fast path.
 */
async function verifiedJwtSub(token: string): Promise<string | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null; // not a JWT — opaque token path

  let header: { alg?: string; kid?: string };
  let payload: Record<string, unknown>;
  try {
    header = JSON.parse(b64urlToBuffer(parts[0]).toString("utf-8"));
    payload = JSON.parse(b64urlToBuffer(parts[1]).toString("utf-8"));
  } catch {
    return null;
  }

  // Only RS256 is accepted. This explicitly rejects "none" and HMAC algs, which
  // are the classic JWT signature-bypass vectors.
  if (header.alg !== "RS256") return null;

  // Reject expired tokens.
  if (typeof payload.exp === "number" && payload.exp * 1000 <= Date.now()) return null;

  const keys = await fetchJwks();
  if (keys.length === 0) return null; // can't verify → caller uses userinfo

  const candidates = header.kid ? keys.filter((k) => k.kid === header.kid) : keys;
  const signingInput = Buffer.from(`${parts[0]}.${parts[1]}`);
  const signature = b64urlToBuffer(parts[2]);

  for (const jwk of candidates.length > 0 ? candidates : keys) {
    if (jwk.kty !== "RSA") continue;
    try {
      const key = createPublicKey({
        key: jwk as unknown as import("node:crypto").JsonWebKey,
        format: "jwk",
      });
      if (verifySignature("RSA-SHA256", signingInput, key, signature)) {
        const sub = payload.sub ?? payload.user_id ?? payload.userId;
        if (sub === null || sub === undefined) return null;
        return String(sub) || null;
      }
    } catch {
      // Bad key material — try the next candidate.
    }
  }

  return null; // signature did not verify against any key
}

/**
 * Extracts the Bearer token from the request, resolves the user from the DB,
 * and returns { userId, user } or a 401 NextResponse.
 *
 * Two-stage lookup so legacy users (whose qfId was stored via the QF userinfo
 * endpoint before the JWT fast-path was reliable) are still found even when the
 * JWT sub claim is present but has a different string representation.
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

  // Stage 1 — verified-JWT fast path (no userinfo round-trip)
  let user: User | undefined;
  const jwtSub = await verifiedJwtSub(token);
  if (jwtSub) {
    [user] = await db.select().from(users).where(eq(users.qfId, jwtSub)).limit(1);
  }

  // Stage 2 — QF userinfo slow path (handles opaque tokens and qfId format mismatches)
  if (!user) {
    const qfId = await resolveQfIdFromUserinfo(token);
    if (qfId) {
      [user] = await db.select().from(users).where(eq(users.qfId, qfId)).limit(1);
    }
  }

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Opportunistically evict expired entries so the in-process cache can't grow
  // unbounded across many distinct tokens.
  if (tokenCache.size > 64 && Math.random() < 0.05) {
    const now = Date.now();
    for (const [t, v] of tokenCache) {
      if (v.expiresAt <= now) tokenCache.delete(t);
    }
  }
  tokenCache.set(token, { user, expiresAt: Date.now() + CACHE_TTL_MS });
  return { userId: user.id, user };
}

/**
 * Returns the QF user ID (sub) for an access token. Tries the verified-JWT fast
 * path first (no network call), then falls back to the QF userinfo endpoint for
 * opaque tokens or when the signature can't be verified locally.
 */
export async function resolveQfId(accessToken: string): Promise<string | null> {
  const jwtSub = await verifiedJwtSub(accessToken);
  if (jwtSub) return jwtSub;
  return resolveQfIdFromUserinfo(accessToken);
}

/**
 * Resolves the QF user ID by hitting the QF userinfo endpoint directly,
 * skipping the JWT fast path. Used as a fallback in requireUser when the
 * JWT sub doesn't match any stored qfId.
 */
async function resolveQfIdFromUserinfo(accessToken: string): Promise<string | null> {
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
