import { describe, it, expect, afterEach, vi } from "vitest";
import { HAS_SESSION_COOKIE_NAME, hasSessionCookieOptions } from "@/lib/auth/session-cookie";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("hasSessionCookieOptions", () => {
  it("is a JS-readable marker (not HttpOnly) so the client can skip the refresh call", () => {
    expect(hasSessionCookieOptions(60).httpOnly).toBe(false);
  });

  it("is Lax, site-wide and carries the requested max-age", () => {
    expect(hasSessionCookieOptions(3600)).toMatchObject({
      sameSite: "lax",
      path: "/",
      maxAge: 3600,
    });
  });

  it("is Secure only in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(hasSessionCookieOptions(60).secure).toBe(true);
    vi.stubEnv("NODE_ENV", "development");
    expect(hasSessionCookieOptions(60).secure).toBe(false);
  });

  it("uses a cookie name distinct from the refresh token cookie", () => {
    expect(HAS_SESSION_COOKIE_NAME).toBe("qf_has_session");
    expect(HAS_SESSION_COOKIE_NAME).not.toBe("qf_refresh_token");
  });
});
