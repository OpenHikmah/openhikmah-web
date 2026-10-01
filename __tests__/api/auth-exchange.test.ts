import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const { mockRateLimitOrNull } = vi.hoisted(() => ({
  mockRateLimitOrNull: vi.fn(async (): Promise<NextResponse | null> => null),
}));
vi.mock("@/lib/infra/rate-limit", () => ({ rateLimitOrNull: mockRateLimitOrNull }));

import { POST } from "@/app/api/auth/exchange/route";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Defaults to a well-formed request: a `state` in the body and a
// qf_oauth_state cookie matching the body's state + nonce, as
// /api/auth/start would have issued. `cookie` overrides the cookie value
// (null = no cookie at all).
function makeReq(body: Record<string, unknown>, cookie?: string | null) {
  const withState = { state: "test-state", ...body };
  const cookieValue =
    cookie === undefined ? `${String(withState.state)}:${String(body.nonce)}` : cookie;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cookieValue !== null) headers.cookie = `qf_oauth_state=${cookieValue}`;
  return new NextRequest("http://localhost/api/auth/exchange", {
    method: "POST",
    headers,
    body: JSON.stringify(withState),
  });
}

function expectNoSessionCookies(res: Response) {
  const setCookies = res.headers.getSetCookie();
  expect(setCookies.some((c) => c.startsWith("qf_refresh_token="))).toBe(false);
  expect(setCookies.some((c) => c.startsWith("qf_has_session="))).toBe(false);
}

function expectStateCookieCleared(res: Response) {
  const setCookie = res.headers.get("set-cookie") ?? "";
  expect(setCookie).toMatch(/qf_oauth_state=;/);
  expect(setCookie).toMatch(/Max-Age=0/i);
}

describe("POST /api/auth/exchange", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockRateLimitOrNull.mockReset().mockResolvedValue(null);
  });

  it("returns 429 when the rate limiter reports over-limit, without calling the token endpoint", async () => {
    mockRateLimitOrNull.mockResolvedValue(
      NextResponse.json({ error: "Too many requests" }, { status: 429 })
    );
    const res = await POST(makeReq({ code: "auth-code", codeVerifier: "verifier" }));
    expect(res.status).toBe(429);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed JSON body", async () => {
    const req = new NextRequest("http://localhost/api/auth/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when code is missing", async () => {
    const res = await POST(makeReq({ codeVerifier: "verifier" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/missing/i);
  });

  it("returns 400 when codeVerifier is missing", async () => {
    const res = await POST(makeReq({ code: "auth-code", nonce: "n" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when nonce is missing", async () => {
    const res = await POST(makeReq({ code: "auth-code", codeVerifier: "verifier" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/nonce/i);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns accessToken in body and sets refresh token as HttpOnly cookie", async () => {
    const b64url = (s: string) =>
      Buffer.from(s).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
    const idToken = `${b64url(JSON.stringify({ alg: "RS256" }))}.${b64url(
      JSON.stringify({ nonce: "n" })
    )}.sig`;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: "access-123",
        refresh_token: "refresh-456",
        id_token: idToken,
      }),
    });

    const res = await POST(makeReq({ code: "auth-code", codeVerifier: "verifier", nonce: "n" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accessToken).toBe("access-123");
    expect(body.refreshToken).toBeUndefined();
    const setCookies = res.headers.getSetCookie();
    const refreshCookie = setCookies.find((c) => c.startsWith("qf_refresh_token=")) ?? "";
    expect(refreshCookie).toContain("qf_refresh_token=refresh-456");
    expect(refreshCookie.toLowerCase()).toContain("httponly");
    const hasSessionCookie = setCookies.find((c) => c.startsWith("qf_has_session=")) ?? "";
    expect(hasSessionCookie).toContain("qf_has_session=1");
    expect(hasSessionCookie.toLowerCase()).not.toContain("httponly");
  });

  it("does not set cookie when server provides no refresh token", async () => {
    const b64url = (s: string) =>
      Buffer.from(s).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
    const idToken = `${b64url(JSON.stringify({ alg: "RS256" }))}.${b64url(
      JSON.stringify({ nonce: "n" })
    )}.sig`;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: "access-123", id_token: idToken }),
    });

    const res = await POST(makeReq({ code: "auth-code", codeVerifier: "verifier", nonce: "n" }));
    const body = await res.json();
    expect(body.accessToken).toBe("access-123");
    const setCookies = res.headers.getSetCookie();
    expect(setCookies.some((c) => c.startsWith("qf_refresh_token="))).toBe(false);
    expect(setCookies.some((c) => c.startsWith("qf_has_session="))).toBe(false);
    expectStateCookieCleared(res);
  });

  // Issue #636: state/nonce must match the HttpOnly cookie /api/auth/start set
  // in this browser, checked before the code is sent to the token endpoint.
  describe("server-side state binding", () => {
    it("rejects a request with no state in the body", async () => {
      const req = new NextRequest("http://localhost/api/auth/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: "qf_oauth_state=s:n" },
        body: JSON.stringify({ code: "c", codeVerifier: "v", nonce: "n" }),
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/state/i);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("rejects when the state cookie is missing (e.g. a login-CSRF from another browser)", async () => {
      const res = await POST(makeReq({ code: "c", codeVerifier: "v", nonce: "n" }, null));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("State verification failed");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("rejects a state that differs from the cookie", async () => {
      const res = await POST(
        makeReq(
          { code: "c", codeVerifier: "v", state: "attacker-state", nonce: "n" },
          "victim-state:n"
        )
      );
      expect(res.status).toBe(400);
      expect(mockFetch).not.toHaveBeenCalled();
      expectStateCookieCleared(res);
    });

    it("rejects a nonce that differs from the cookie, even with a matching state", async () => {
      const res = await POST(
        makeReq(
          { code: "c", codeVerifier: "v", state: "s", nonce: "attacker-nonce" },
          "s:victim-nonce"
        )
      );
      expect(res.status).toBe(400);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("rejects a malformed cookie value", async () => {
      const res = await POST(
        makeReq({ code: "c", codeVerifier: "v", state: "s", nonce: "n" }, "s")
      );
      expect(res.status).toBe(400);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("clears the state cookie on a failed token exchange so it can't be replayed", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 400, text: async () => "bad" });
      vi.spyOn(console, "error").mockImplementation(() => {});
      const res = await POST(makeReq({ code: "c", codeVerifier: "v", nonce: "n" }));
      expect(res.status).toBe(400);
      expectStateCookieCleared(res);
    });
  });

  it("sends correct grant_type and code to token endpoint", async () => {
    let capturedBody: URLSearchParams;
    mockFetch.mockImplementationOnce(async (_url: string, opts: RequestInit) => {
      capturedBody = new URLSearchParams(opts.body as string);
      return {
        ok: true,
        json: async () => ({ access_token: "tok" }),
      };
    });

    await POST(makeReq({ code: "my-code", codeVerifier: "my-verifier", nonce: "n" }));
    expect(capturedBody!.get("grant_type")).toBe("authorization_code");
    expect(capturedBody!.get("code")).toBe("my-code");
    expect(capturedBody!.get("code_verifier")).toBe("my-verifier");
  });

  describe("OIDC nonce verification", () => {
    function fakeIdToken(payload: object) {
      const b64url = (s: string) =>
        Buffer.from(s).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
      return `${b64url(JSON.stringify({ alg: "RS256" }))}.${b64url(JSON.stringify(payload))}.sig`;
    }

    it("accepts a matching nonce", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: "access-123",
          refresh_token: "refresh-456",
          id_token: fakeIdToken({ nonce: "expected-nonce" }),
        }),
      });

      const res = await POST(
        makeReq({ code: "auth-code", codeVerifier: "verifier", nonce: "expected-nonce" })
      );
      expect(res.status).toBe(200);
      expect((await res.json()).accessToken).toBe("access-123");
    });

    it("rejects a nonce mismatch with 400 and sets no session cookie", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: "access-123",
          refresh_token: "refresh-456",
          id_token: fakeIdToken({ nonce: "attacker-nonce" }),
        }),
      });

      const res = await POST(
        makeReq({ code: "auth-code", codeVerifier: "verifier", nonce: "expected-nonce" })
      );
      expect(res.status).toBe(400);
      expectNoSessionCookies(res);
    });

    it("rejects an undecodable id_token with 400 when a nonce was provided", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: "access-123",
          id_token: "not-a-jwt",
        }),
      });

      const res = await POST(
        makeReq({ code: "auth-code", codeVerifier: "verifier", nonce: "expected-nonce" })
      );
      expect(res.status).toBe(400);
    });

    it("fails closed (400, no cookie) when the token response has no id_token", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "access-123", refresh_token: "refresh-456" }),
      });

      const res = await POST(
        makeReq({ code: "auth-code", codeVerifier: "verifier", nonce: "expected-nonce" })
      );
      expect(res.status).toBe(400);
      expectNoSessionCookies(res);
    });

    it("fails closed on a non-string id_token", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: "access-123",
          refresh_token: "refresh-456",
          id_token: 12345,
        }),
      });

      const res = await POST(
        makeReq({ code: "auth-code", codeVerifier: "verifier", nonce: "expected-nonce" })
      );
      expect(res.status).toBe(400);
      expectNoSessionCookies(res);
    });

    it("rejects the exchange outright when the client sends no nonce", async () => {
      const res = await POST(makeReq({ code: "auth-code", codeVerifier: "verifier" }));
      expect(res.status).toBe(400);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  it("returns 400 when token endpoint returns non-ok", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => "invalid_grant",
    });

    const res = await POST(makeReq({ code: "bad-code", codeVerifier: "verifier", nonce: "n" }));
    expect(res.status).toBe(400);
  });

  it("returns 500 when fetch throws", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network error"));
    const res = await POST(makeReq({ code: "code", codeVerifier: "verifier", nonce: "n" }));
    expect(res.status).toBe(500);
  });
});
