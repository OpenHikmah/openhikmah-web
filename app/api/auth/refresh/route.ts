import { NextRequest, NextResponse } from "next/server";

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
const inflight = new Map<string, Promise<RefreshOutcome>>();
const recent = new Map<string, { outcome: RefreshOutcome; at: number }>();
const RESULT_TTL_MS = 30_000;

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
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      return body?.error === "invalid_grant" ? { kind: "invalid" } : { kind: "transient" };
    }

    const data = (await res.json()) as { access_token: string; refresh_token?: string };
    // Re-stamp the existing token if the provider didn't rotate.
    return { kind: "ok", accessToken: data.access_token, refreshToken: data.refresh_token ?? refreshToken };
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

  const existing = inflight.get(refreshToken);
  if (existing) return existing;

  const pending = callTokenEndpoint(refreshToken)
    .then((outcome) => {
      // Cache definitive outcomes; let transient failures be retried immediately.
      if (outcome.kind !== "transient") recent.set(refreshToken, { outcome, at: Date.now() });
      return outcome;
    })
    .finally(() => inflight.delete(refreshToken));

  inflight.set(refreshToken, pending);
  return pending;
}

export async function POST(req: NextRequest) {
  const refreshToken = req.cookies.get(COOKIE_NAME)?.value;
  if (!refreshToken) {
    return NextResponse.json({ error: "No session" }, { status: 401 });
  }

  const outcome = await refresh(refreshToken);

  if (outcome.kind === "ok") {
    const response = NextResponse.json({ accessToken: outcome.accessToken });
    response.cookies.set(COOKIE_NAME, outcome.refreshToken, cookieOptions(60 * 60 * 24 * 30));
    return response;
  }

  if (outcome.kind === "invalid") {
    const response = NextResponse.json({ error: "Session expired" }, { status: 401 });
    response.cookies.delete(COOKIE_NAME);
    return response;
  }

  // transient — keep the cookie, signal "try again later"
  return NextResponse.json({ error: "Refresh failed" }, { status: 503 });
}
