import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
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
  beforeEach(() => mockFetch.mockReset());

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

  it("returns accessToken and refreshToken on success", async () => {
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
    expect(body.refreshToken).toBe("refresh-456");
  });

  it("returns null refreshToken when not provided by server", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: "access-123" }),
    });

    const res = await POST(makeReq({ code: "auth-code", codeVerifier: "verifier" }));
    const body = await res.json();
    expect(body.refreshToken).toBeNull();
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
