import { NextResponse } from "next/server";
import { randomString } from "@/lib/auth/pkce";
import {
  OAUTH_STATE_COOKIE_NAME,
  encodeOAuthState,
  oauthStateCookieOptions,
} from "@/lib/auth/oauth-state-cookie";

/**
 * Issues the OAuth `state` and OIDC `nonce` for a new sign-in and binds them
 * to this browser in an HttpOnly cookie, so /api/auth/exchange can check them
 * against values the server itself issued (issue #636) instead of trusting
 * only the client-side sessionStorage comparison.
 */
export async function POST() {
  const state = randomString(32);
  const nonce = randomString(32);
  const response = NextResponse.json({ state, nonce });
  response.cookies.set(
    OAUTH_STATE_COOKIE_NAME,
    encodeOAuthState(state, nonce),
    oauthStateCookieOptions
  );
  return response;
}
