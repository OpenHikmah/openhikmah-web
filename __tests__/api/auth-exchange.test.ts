import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const { mockRateLimitOrNull } = vi.hoisted(() => ({
  mockRateLimitOrNull: vi.fn(async (): Promise<NextResponse | null> => null),
}));
vi.mock("@/lib/infra/rate-limit", () => ({ rateLimitOrNull: mockRateLimitOrNull }));

import { POST } from "@/app/api/auth/exchange/route";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function makeReq(body: object) {
  return new NextRequest("http://localhost/api/auth/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
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
    const res = await POST(makeReq({ code: "auth-code" }));
    expect(res.status).toBe(400);
  });

  it("returns accessToken in body and sets refresh token as HttpOnly cookie", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: "access-123",
        refresh_token: "refresh-456",
      }),
    });

    const res = await POST(makeReq({ code: "auth-code", codeVerifier: "verifier" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accessToken).toBe("access-123");
    expect(body.refreshToken).toBeUndefined();
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("qf_refresh_token=refresh-456");
    expect(setCookie.toLowerCase()).toContain("httponly");
  });

  it("does not set cookie when server provides no refresh token", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: "access-123" }),
    });

    const res = await POST(makeReq({ code: "auth-code", codeVerifier: "verifier" }));
    const body = await res.json();
    expect(body.accessToken).toBe("access-123");
    expect(res.headers.get("set-cookie")).toBeNull();
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

    await POST(makeReq({ code: "my-code", codeVerifier: "my-verifier" }));
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
      expect(res.headers.get("set-cookie")).toBeNull();
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
      expect(res.headers.get("set-cookie")).toBeNull();
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
      expect(res.headers.get("set-cookie")).toBeNull();
    });

    it("skips the check when the client sends no nonce (legacy in-flight sign-ins)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: "access-123",
          id_token: fakeIdToken({ nonce: "whatever" }),
        }),
      });

      const res = await POST(makeReq({ code: "auth-code", codeVerifier: "verifier" }));
      expect(res.status).toBe(200);
    });
  });

  it("returns 400 when token endpoint returns non-ok", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => "invalid_grant",
    });

    const res = await POST(makeReq({ code: "bad-code", codeVerifier: "verifier" }));
    expect(res.status).toBe(400);
  });

  it("returns 500 when fetch throws", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network error"));
    const res = await POST(makeReq({ code: "code", codeVerifier: "verifier" }));
    expect(res.status).toBe(500);
  });
});
