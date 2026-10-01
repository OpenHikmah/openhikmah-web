import { timingSafeEqual } from "node:crypto";

// HttpOnly cookie binding one sign-in attempt's OAuth `state` and OIDC `nonce`
// to this browser (issue #636). /api/auth/start issues both values and sets it;
// /api/auth/exchange only proceeds when the client echoes the same pair, so a
// login-CSRF that replays an attacker's own code/state/nonce into a victim's
// browser fails: the victim's cookie holds values the attacker never saw.
export const OAUTH_STATE_COOKIE_NAME = "qf_oauth_state";

// ":" is outside the PKCE charset randomString() draws from, so it can't
// appear inside either value.
const SEPARATOR = ":";

export const oauthStateCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  // Lax is enough: the cookie is only read by the same-origin exchange POST.
  sameSite: "lax" as const,
  path: "/api/auth",
  // Covers a slow trip through the QF login page; the cookie is single-use anyway.
  maxAge: 10 * 60,
};

export function encodeOAuthState(state: string, nonce: string): string {
  return `${state}${SEPARATOR}${nonce}`;
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** True only when the cookie exists and both values match it exactly. */
export function matchesOAuthState(
  cookieValue: string | undefined,
  state: string,
  nonce: string
): boolean {
  if (!cookieValue) return false;
  const parts = cookieValue.split(SEPARATOR);
  if (parts.length !== 2) return false;
  // Both compared unconditionally (no short-circuit) so timing doesn't reveal
  // which half matched.
  const stateOk = safeEqual(parts[0], state);
  const nonceOk = safeEqual(parts[1], nonce);
  return stateOk && nonceOk;
}
