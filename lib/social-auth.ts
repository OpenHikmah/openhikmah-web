import { NextRequest, NextResponse } from "next/server";
import { createHash, createPublicKey, verify as verifySignature } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { users, type User } from "./db/schema";
import { redisGet, redisSet, redisDel } from "./redis";
import { incr } from "./metrics";

export interface AuthedUser {
  userId: number;
  user: User;
}

// A soft-disabled account (set by an admin) is rejected at the auth boundary.
// Returned as 403 so the client can distinguish "disabled" from "not signed in".
// Note: a freshly-disabled user may linger until their cached entry expires
// (≤5 min) or the token caches are flushed from the admin Infra panel.
function disabledResponse(): NextResponse {
  return NextResponse.json({ error: "Account disabled" }, { status: 403 });
}

// Two-tier token cache: an in-process L1 Map (fastest, per-instance) backed by a
// Redis L2 (shared across instances, survives restarts). The L1 keeps the hot
// path zero-round-trip; the L2 means a deploy/restart no longer logs everyone out
// and a re-auth storm doesn't hammer the QF userinfo endpoint. When Redis is
// disabled this degrades to exactly the previous in-process-only behavior.
export const tokenCache = new Map<string, { user: User; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const CACHE_TTL_SECONDS = CACHE_TTL_MS / 1000;

// Tokens are secrets, so the Redis key is a hash of the token, never the token
// itself. The value is just the user id — the full user is re-read from Postgres
// by primary key (cheap) to avoid Date-serialization pitfalls of caching the row.
function tokenRedisKey(token: string): string {
  return `auth:tok:${createHash("sha256").update(token).digest("hex")}`;
}

export function invalidateTokenCache(token: string): void {
  tokenCache.delete(token);
  void redisDel(tokenRedisKey(token));
}

/**
 * Clears the in-process token cache (admin Infra action). Forces every request
 * to re-resolve its user on the next call, so a just-disabled account stops being
 * served from this instance's L1 immediately. Redis L2 token entries expire on
 * their own ≤5-min TTL. Returns how many entries were dropped.
 */
export function clearTokenCache(): number {
  const n = tokenCache.size;
  tokenCache.clear();
  return n;
}

/** Drops the cached JWKS (in-process + Redis) so the next verify refetches QF's
 *  signing keys — used after a key rotation from the admin Infra panel. */
export function clearJwksCache(): void {
  jwksCache = null;
  void redisDel(JWKS_REDIS_KEY);
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
const JWKS_REDIS_KEY = "auth:jwks";

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

  // L2 — Redis, so a restart doesn't refetch QF's keys for every instance. The
  // absolute `expiresAt` is stored alongside the keys (not just relied on via the
  // Redis TTL) so a reader can't re-stamp its in-process cache to a fresh full hour
  // off an already-aged Redis copy — total staleness stays bounded by JWKS_TTL_MS.
  const cached = await redisGet(JWKS_REDIS_KEY);
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as { keys?: Jwk[]; expiresAt?: number };
      if (
        Array.isArray(parsed.keys) &&
        parsed.keys.length > 0 &&
        typeof parsed.expiresAt === "number" &&
        parsed.expiresAt > Date.now()
      ) {
        jwksCache = { keys: parsed.keys, expiresAt: parsed.expiresAt };
        return parsed.keys;
      }
    } catch {
      // Corrupt/legacy cache entry — fall through to a fresh network fetch.
    }
  }

  for (const url of jwksUrls()) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) continue;
      const data = (await res.json()) as { keys?: Jwk[] };
      if (Array.isArray(data.keys) && data.keys.length > 0) {
        const expiresAt = Date.now() + JWKS_TTL_MS;
        jwksCache = { keys: data.keys, expiresAt };
        void redisSet(JWKS_REDIS_KEY, JSON.stringify({ keys: data.keys, expiresAt }), JWKS_TTL_MS / 1000);
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

  // L1 — in-process cache, zero round-trip.
  const cached = tokenCache.get(token);
  if (cached && cached.expiresAt > Date.now()) {
    incr("auth_l1_hit");
    if (cached.user.disabledAt) return disabledResponse();
    return { userId: cached.user.id, user: cached.user };
  }

  // L2 — Redis: shared across instances and survives restarts. Holds token→id;
  // the row is re-read by primary key (cheap, indexed) to keep it current.
  const cachedUserId = await redisGet(tokenRedisKey(token));
  if (cachedUserId) {
    const id = Number(cachedUserId);
    if (Number.isInteger(id)) {
      const [u] = await db.select().from(users).where(eq(users.id, id)).limit(1);
      if (u) {
        incr("auth_l2_hit");
        tokenCache.set(token, { user: u, expiresAt: Date.now() + CACHE_TTL_MS });
        if (u.disabledAt) return disabledResponse();
        return { userId: u.id, user: u };
      }
    }
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
  incr("auth_cache_miss");
  tokenCache.set(token, { user, expiresAt: Date.now() + CACHE_TTL_MS });
  void redisSet(tokenRedisKey(token), String(user.id), CACHE_TTL_SECONDS);
  if (user.disabledAt) return disabledResponse();
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
