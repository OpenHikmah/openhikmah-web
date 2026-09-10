import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { HAS_SESSION_COOKIE_NAME, hasSessionCookieOptions } from "@/lib/auth/session-cookie";
import { redisDel, redisEnabled, redisGet, redisSet, redisSetNx } from "@/lib/infra/redis";

const COOKIE_NAME = "qf_refresh_token";

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

type RefreshOutcome =
  // Refreshed (or re-stamped) successfully — `refreshToken` is the value to store.
  | { kind: "ok"; accessToken: string; refreshToken: string }
  // Grant genuinely invalid/expired/revoked — clear the cookie, force re-login.
  | { kind: "invalid" }
  // Transient upstream/network failure — keep the cookie so a later load recovers.
  | { kind: "transient" };

// ── Single-flight + short result cache, keyed on the INCOMING refresh token ──
//
// Ory rotates refresh tokens and revokes the whole session if a rotated (already
// used) token is presented again. Multiple page loads racing on the same cookie
// (e.g. opening two tabs, or navigating before a prior rotation's Set-Cookie
// commits) would each send the same token and trip that reuse detection. To make
// rotation safe, every request bearing token T is served by ONE upstream call:
// concurrent requests share the in-flight promise, and requests that arrive just
// afterwards (still holding the old cookie) get the cached result — so Ory only
// ever sees T used once, and every caller's browser converges onto the new token.
//
// The per-process maps below only coalesce within one instance. When Redis is
// configured this is also backed by a shared result cache + lock keyed on a hash
// of T, so two instances (or a restart mid-rotation) still present T upstream
// exactly once. Redis stays optional: with it disabled, or unreachable, this
// degrades to the per-process behavior.
const inflight = new Map<string, Promise<RefreshOutcome>>();
const recent = new Map<string, { outcome: RefreshOutcome; at: number }>();
const RESULT_TTL_MS = 30_000;
const RESULT_TTL_SECONDS = RESULT_TTL_MS / 1000;
// Hard timeout on the upstream token call. Kept below LOCK_TTL_SECONDS so the
// leader always settles (releasing or deliberately holding its lock) before the
// lock could auto-expire under it and let a second caller present the same token.
const UPSTREAM_TIMEOUT_MS = 8_000;
// A crashed leader's lock self-clears after this so the next request can lead.
const LOCK_TTL_SECONDS = 10;
// A waiter that can't get the lock polls the shared result cache this long
// before giving up with a retryable 503 (well under LOCK_TTL_SECONDS).
const POLL_TIMEOUT_MS = 5_000;
const POLL_INTERVAL_MS = 250;

// Tokens are secrets — the Redis key is a hash of the token, never the token
// itself (mirrors lib/auth/social-auth.ts).
function resultKey(refreshToken: string): string {
  return `auth:refresh:${createHash("sha256").update(refreshToken).digest("hex")}`;
}
function lockKey(refreshToken: string): string {
  return `${resultKey(refreshToken)}:lock`;
}

// "ok" and "invalid" are definitive and safe to replay; "transient" must be
// retried against the live endpoint.
function isCacheable(outcome: RefreshOutcome): boolean {
  return outcome.kind === "ok" || outcome.kind === "invalid";
}

async function readSharedOutcome(refreshToken: string): Promise<RefreshOutcome | null> {
  const raw = await redisGet(resultKey(refreshToken));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<RefreshOutcome>;
    if (
      parsed.kind === "ok" &&
      typeof parsed.accessToken === "string" &&
      typeof parsed.refreshToken === "string"
    ) {
      return { kind: "ok", accessToken: parsed.accessToken, refreshToken: parsed.refreshToken };
    }
    if (parsed.kind === "invalid") return { kind: "invalid" };
    console.error(
      "auth/refresh: unrecognized shared outcome shape in Redis — leading a fresh refresh"
    );
    return null;
  } catch {
    console.error(
      "auth/refresh: could not parse shared outcome from Redis — leading a fresh refresh"
    );
    return null;
  }
}

async function pollSharedOutcome(refreshToken: string): Promise<RefreshOutcome | null> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    const shared = await readSharedOutcome(refreshToken);
    if (shared) return shared;
    // The leader released its lock without publishing a result → its outcome was
    // transient. Stop now and let the caller return a retryable 503 rather than
    // stalling for the full timeout on a failure everyone will just retry.
    if ((await redisGet(lockKey(refreshToken))) === null) return null;
  }
  return null;
}

/** Release the lock only if it is still the one we took — so a leader that
 *  overran its TTL can't delete a successor's lock. */
async function releaseLock(refreshToken: string, nonce: string): Promise<void> {
  if ((await redisGet(lockKey(refreshToken))) === nonce) {
    await redisDel(lockKey(refreshToken));
  }
}

function rememberLocally(refreshToken: string, outcome: RefreshOutcome): void {
  if (isCacheable(outcome)) recent.set(refreshToken, { outcome, at: Date.now() });
}

async function callTokenEndpoint(refreshToken: string): Promise<RefreshOutcome> {
  const tokenUrl = `${process.env.QF_AUTH_BASE}/oauth2/token`;
  const clientId = process.env.NEXT_PUBLIC_QF_CLIENT_ID!;
  const clientSecret = process.env.QF_CLIENT_SECRET!;
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  try {
    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }).toString(),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      return body?.error === "invalid_grant" ? { kind: "invalid" } : { kind: "transient" };
    }

    const data = (await res.json()) as { access_token: string; refresh_token?: string };
    // Re-stamp the existing token if the provider didn't rotate.
    return {
      kind: "ok",
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? refreshToken,
    };
  } catch {
    return { kind: "transient" };
  }
}

function refresh(refreshToken: string): Promise<RefreshOutcome> {
  const now = Date.now();
  for (const [token, entry] of recent) {
    if (now - entry.at > RESULT_TTL_MS) recent.delete(token);
  }

  const cached = recent.get(refreshToken);
  if (cached) return Promise.resolve(cached.outcome);

  // In-process coalescing (no Redis round-trip for same-instance races). The
  // get→set must stay synchronous — no await between them.
  const existing = inflight.get(refreshToken);
  if (existing) return existing;

  const pending = (
    redisAvailable() ? leadRefreshCoordinated(refreshToken) : leadRefreshLocal(refreshToken)
  ).finally(() => inflight.delete(refreshToken));
  inflight.set(refreshToken, pending);
  return pending;
}

/** `redisEnabled()` constructs the client on first call and can throw
 *  synchronously on a malformed REDIS_URL — never let that 500 the refresh
 *  endpoint; fall back to the per-process path. */
function redisAvailable(): boolean {
  try {
    return redisEnabled();
  } catch {
    return false;
  }
}

/** One upstream call, its definitive outcome remembered per-process. */
function leadRefreshLocal(refreshToken: string): Promise<RefreshOutcome> {
  return callTokenEndpoint(refreshToken).then((outcome) => {
    rememberLocally(refreshToken, outcome);
    return outcome;
  });
}

/**
 * Perform (or wait out) one refresh for `refreshToken`, coordinating across
 * instances via Redis:
 *  - a result another instance already cached is replayed;
 *  - otherwise take a short Redis lock and call the token endpoint once,
 *    publishing the definitive outcome for peers;
 *  - a caller that can't take the lock waits for the winner's result rather than
 *    presenting the (rotated) token itself, and returns a retryable "transient"
 *    if none appears in time.
 * If Redis turns out to be unreachable it falls back to a plain per-process call.
 */
async function leadRefreshCoordinated(refreshToken: string): Promise<RefreshOutcome> {
  const shared = await readSharedOutcome(refreshToken);
  if (shared) {
    rememberLocally(refreshToken, shared);
    return shared;
  }

  const nonce = randomUUID();
  const gotLock = await redisSetNx(lockKey(refreshToken), nonce, LOCK_TTL_SECONDS);

  if (gotLock === false) {
    // A peer instance is refreshing this token. Wait for its result; never call
    // the endpoint ourselves — that's the double-present that revokes the session.
    const waited = await pollSharedOutcome(refreshToken);
    if (waited) {
      rememberLocally(refreshToken, waited);
      return waited;
    }
    return { kind: "transient" };
  }

  if (gotLock === true) {
    const outcome = await callTokenEndpoint(refreshToken);
    if (isCacheable(outcome)) {
      // The rotated refresh token + access token are cached here in cleartext for
      // RESULT_TTL_SECONDS so peer instances can replay them instead of
      // re-presenting the (now consumed) token. The key is a hash of the incoming
      // token; the deployment must run Redis with auth + TLS + network isolation
      // (same trust assumption as lib/auth/social-auth.ts's token cache).
      const published = await redisSet(
        resultKey(refreshToken),
        JSON.stringify(outcome),
        RESULT_TTL_SECONDS
      );
      rememberLocally(refreshToken, outcome);
      // Only release the lock once peers can actually read the result. If the
      // publish didn't land, keep the lock until its TTL so peers keep getting a
      // retryable 503 rather than re-leading and presenting the (now consumed)
      // token a second time.
      if (published) await releaseLock(refreshToken, nonce);
    } else {
      // transient — the token wasn't successfully consumed, so a retry can lead.
      await releaseLock(refreshToken, nonce);
    }
    return outcome;
  }

  // gotLock === null → Redis went unreachable between redisAvailable() and here.
  // Behave as a single instance: the per-process inflight/recent maps still
  // coalesce this instance; a cross-instance race is the pre-existing latent risk.
  return leadRefreshLocal(refreshToken);
}

export async function POST(req: NextRequest) {
  const refreshToken = req.cookies.get(COOKIE_NAME)?.value;
  if (!refreshToken) {
    const response = NextResponse.json({ error: "No session" }, { status: 401 });
    response.cookies.delete(HAS_SESSION_COOKIE_NAME);
    return response;
  }

  const outcome = await refresh(refreshToken);

  if (outcome.kind === "ok") {
    const response = NextResponse.json({ accessToken: outcome.accessToken });
    response.cookies.set(COOKIE_NAME, outcome.refreshToken, cookieOptions(60 * 60 * 24 * 30));
    response.cookies.set(HAS_SESSION_COOKIE_NAME, "1", hasSessionCookieOptions(60 * 60 * 24 * 30));
    return response;
  }

  if (outcome.kind === "invalid") {
    const response = NextResponse.json({ error: "Session expired" }, { status: 401 });
    response.cookies.delete(COOKIE_NAME);
    response.cookies.delete(HAS_SESSION_COOKIE_NAME);
    return response;
  }

  // transient — keep the cookie, signal "try again later"
  return NextResponse.json({ error: "Refresh failed" }, { status: 503 });
}
