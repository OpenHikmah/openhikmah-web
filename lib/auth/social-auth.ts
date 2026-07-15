import { NextRequest, NextResponse } from "next/server";
import { createHash, createPublicKey, verify as verifySignature } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/infra/db";
import { users, type User } from "@/lib/infra/db/schema";
import { redisGet, redisSet, redisDel, redisPublish, redisSubscribe } from "@/lib/infra/redis";
import { incr } from "@/lib/infra/metrics";

export interface AuthedUser {
  userId: number;
  user: User;
}

// A soft-disabled account (set by an admin) is rejected at the auth boundary.
// Returned as 403 so the client can distinguish "disabled" from "not signed in".
// A disable/flush is broadcast via Redis pub/sub (see broadcastUserCacheInvalidation
// / broadcastFlushTokenCache below) so every instance's L1 drops the stale entry
// immediately, not just the instance that served the admin's request.
function disabledResponse(): NextResponse {
  return NextResponse.json({ error: "Account disabled" }, { status: 403 });
}

/**
 * Dev/test login bypass. When `DEV_AUTH_TOKEN` and `DEV_AUTH_QF_ID` are set, a
 * request whose Bearer token equals `DEV_AUTH_TOKEN` is resolved to a fixed dev
 * user (created on first use) — letting the admin console and other authed
 * features be exercised WITHOUT completing the QF OAuth flow (useful when your
 * `redirect_uri` isn't registered with QF yet).
 *
 * FAIL-CLOSED and triple-gated:
 *   1. NODE_ENV must NOT be "production" — there is no override, so this bypass
 *      can never be enabled in a production build, AND
 *   2. both env vars must be set, AND
 *   3. the token must match exactly.
 * To make the dev user an admin, add the same `DEV_AUTH_QF_ID` to `ADMIN_QF_IDS`.
 */
async function resolveDevUser(token: string): Promise<User | null> {
  // Hard off in production — dev/test only, no escape hatch.
  if (process.env.NODE_ENV === "production") return null;
  const secret = process.env.DEV_AUTH_TOKEN;
  const qfId = process.env.DEV_AUTH_QF_ID;
  if (!secret || !qfId || token !== secret) return null;

  const [existing] = await db.select().from(users).where(eq(users.qfId, qfId)).limit(1);
  if (existing) return existing;

  const username = (process.env.DEV_AUTH_USERNAME ?? "devadmin").trim();
  await db.insert(users).values({ qfId, username }).onConflictDoNothing();
  const [created] = await db.select().from(users).where(eq(users.qfId, qfId)).limit(1);
  return created ?? null;
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
 * Clears the in-process token cache on THIS instance only. Forces every request
 * to re-resolve its user on the next call. Redis L2 token entries expire on
 * their own ≤5-min TTL. Returns how many entries were dropped.
 */
export function clearTokenCache(): number {
  const n = tokenCache.size;
  tokenCache.clear();
  return n;
}

// ─── Cross-instance cache invalidation (Redis pub/sub) ────────────────────────
// The L1 token cache is per-process, so disabling a user (or flushing tokens
// from the admin Infra panel) only clears the instance that handled that HTTP
// request — in a multi-instance deployment every other instance keeps serving
// its own stale L1 snapshot for up to CACHE_TTL_MS. These two channels let every
// instance react immediately, without waiting for the local TTL to expire.
const USER_INVALIDATE_CHANNEL = "auth:invalidate-user";
const FLUSH_ALL_CHANNEL = "auth:flush-all";
let subscribed = false;

function ensureInvalidationSubscription(): void {
  if (subscribed) return;
  subscribed = true;
  redisSubscribe(USER_INVALIDATE_CHANNEL, (message) => {
    const userId = Number(message);
    if (!Number.isInteger(userId)) return;
    for (const [t, v] of tokenCache) {
      if (v.user.id === userId) tokenCache.delete(t);
    }
  });
  redisSubscribe(FLUSH_ALL_CHANNEL, () => {
    tokenCache.clear();
  });
}
ensureInvalidationSubscription();

/** Drops `userId` from this instance's L1 cache and broadcasts the same
 *  eviction to every other instance via Redis pub/sub. Call this whenever a
 *  user's disabledAt (or other cached-auth-relevant field) changes. Best-effort:
 *  when Redis is disabled/unreachable, other instances just fall back to the
 *  normal ≤5-min TTL expiry — this never weakens the L2/DB check itself. */
export function broadcastUserCacheInvalidation(userId: number): void {
  for (const [t, v] of tokenCache) {
    if (v.user.id === userId) tokenCache.delete(t);
  }
  redisPublish(USER_INVALIDATE_CHANNEL, String(userId));
}

/** Clears this instance's L1 token cache AND broadcasts the flush to every
 *  other instance, so the admin Infra "flush tokens" action isn't scoped to a
 *  single, arbitrarily-chosen instance. Returns how many entries this instance
 *  dropped. */
export function broadcastFlushTokenCache(): number {
  const n = clearTokenCache();
  redisPublish(FLUSH_ALL_CHANNEL, "1");
  return n;
}

/** Drops the cached JWKS (in-process + Redis) so the next verify refetches QF's
 *  signing keys — used after a key rotation from the admin Infra panel. Awaits the
 *  Redis eviction so the flush is fully complete before the caller reports success
 *  (otherwise an immediate verify could repopulate the in-process cache from the
 *  still-present Redis copy). */
export async function clearJwksCache(): Promise<void> {
  jwksCache = null;
  await redisDel(JWKS_REDIS_KEY);
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
        void redisSet(
          JWKS_REDIS_KEY,
          JSON.stringify({ keys: data.keys, expiresAt }),
          JWKS_TTL_MS / 1000
        );
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

  // Reject expired tokens. Fail closed like every other check — a missing or
  // non-numeric exp is treated as invalid, not as "no expiry."
  if (typeof payload.exp !== "number" || payload.exp * 1000 <= Date.now()) {
    console.warn("jwt rejected: expired or missing exp", { exp: payload.exp });
    return null;
  }

  // Validate audience (aud) — reject cross-client token replay, when the token
  // actually carries an audience claim. QF's Hydra instance does NOT populate
  // `aud` on access tokens (confirmed: claims_supported is just ["sub"] in its
  // OIDC discovery doc, and real production tokens arrive with no aud claim at
  // all) — so a claim that's entirely ABSENT can't be evidence of anything and
  // must not be treated as a rejection. A claim that IS present but doesn't
  // include our client ID is still rejected: that's the actual cross-client
  // replay case this check exists for.
  const qfClientId = process.env.NEXT_PUBLIC_QF_CLIENT_ID;
  if (qfClientId && payload.aud !== undefined) {
    const audiences: unknown[] = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!audiences.some((a) => String(a) === qfClientId)) {
      console.warn("jwt rejected: aud mismatch", { expected: qfClientId, actual: audiences });
      return null;
    }
  }

  // Validate issuer (iss) — reject tokens minted by a different auth domain.
  // QF uses the auth base URL (e.g. "https://oauth2.quran.foundation") as the
  // issuer claim. If the token was issued by a different auth provider, refuse it.
  const qfAuthBase = process.env.QF_AUTH_BASE;
  if (qfAuthBase && (typeof payload.iss !== "string" || payload.iss !== qfAuthBase)) {
    console.warn("jwt rejected: iss mismatch", { expected: qfAuthBase, actual: payload.iss });
    return null;
  }

  const keys = await fetchJwks();
  if (keys.length === 0) {
    console.warn("jwt rejected: no JWKS available");
    return null; // can't verify → caller uses userinfo
  }

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

  console.warn("jwt rejected: signature verification failed against all JWKS candidates");
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
export async function requireUser(req: NextRequest): Promise<AuthedUser | NextResponse> {
  const auth = req.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Dev/test bypass (inert unless DEV_AUTH_* env is configured — see resolveDevUser).
  const devUser = await resolveDevUser(token);
  if (devUser) {
    if (devUser.disabledAt) return disabledResponse();
    return { userId: devUser.id, user: devUser };
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
        // Reject (and don't cache) a disabled account before populating L1.
        if (u.disabledAt) return disabledResponse();
        tokenCache.set(token, { user: u, expiresAt: Date.now() + CACHE_TTL_MS });
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
  let userinfoQfId: string | null = null;
  if (!user) {
    userinfoQfId = await resolveQfIdFromUserinfo(token);
    if (userinfoQfId) {
      [user] = await db.select().from(users).where(eq(users.qfId, userinfoQfId)).limit(1);
    }
  }

  if (!user) {
    console.warn("requireUser rejected: no user resolved", {
      jwtSub,
      userinfoQfId,
      reason:
        jwtSub && !userinfoQfId
          ? "jwt sub had no matching users row and userinfo fallback also found nothing"
          : !jwtSub && userinfoQfId
            ? "jwt verification failed but userinfo resolved a qfId with no matching users row"
            : !jwtSub && !userinfoQfId
              ? "both jwt verification and userinfo fallback failed to resolve any qfId"
              : "jwt sub resolved but no matching users row (qfId format mismatch?)",
    });
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
  // Reject (and don't cache) a disabled account before populating L1/L2.
  if (user.disabledAt) return disabledResponse();
  tokenCache.set(token, { user, expiresAt: Date.now() + CACHE_TTL_MS });
  void redisSet(tokenRedisKey(token), String(user.id), CACHE_TTL_SECONDS);
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
  if (!qfAuthBase) {
    console.warn("userinfo fallback skipped: QF_AUTH_BASE is unset");
    return null;
  }

  // QF's real OIDC discovery doc (`${qfAuthBase}/.well-known/openid-configuration`)
  // advertises `userinfo_endpoint` as `${qfAuthBase}/userinfo` — verified directly
  // against production. The previously-guessed `/oauth2/userinfo` and `/auth/v1/me`
  // paths 404 on QF's real server and never worked.
  const endpoints = [`${qfAuthBase}/userinfo`];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        console.warn("userinfo fallback: endpoint returned non-ok", { url, status: res.status });
        continue;
      }
      const data = (await res.json()) as Record<string, unknown>;
      const sub = (data.sub ?? data.id ?? data.user_id ?? data.userId) as string | undefined;
      if (sub) return String(sub);
      console.warn("userinfo fallback: response had no recognizable sub/id field", {
        url,
        keys: Object.keys(data),
      });
    } catch (err) {
      console.warn("userinfo fallback: request failed", { url, err });
    }
  }

  return null;
}
