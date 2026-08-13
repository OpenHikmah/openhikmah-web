// Non-HttpOnly marker cookie (no token material) that lets client JS know a
// refreshable session exists, without exposing the actual qf_refresh_token
// cookie. Read by SessionRestorer (components/providers.tsx) to skip the
// /api/auth/refresh call — and its resulting 401 — for anonymous visitors.
export const HAS_SESSION_COOKIE_NAME = "qf_has_session";

export function hasSessionCookieOptions(maxAge: number) {
  return {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}
