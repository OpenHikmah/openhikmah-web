import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/auth/refresh/route";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function makeReq(refreshToken?: string) {
  return new NextRequest("http://localhost/api/auth/refresh", {
    method: "POST",
    headers: refreshToken ? { Cookie: `qf_refresh_token=${refreshToken}` } : {},
  });
}

describe("POST /api/auth/refresh", () => {
  beforeEach(() => mockFetch.mockReset());

  it("returns 401 when there is no refresh cookie", async () => {
    const res = await POST(makeReq());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/no session/i);
  });

  it("returns 200 with a new access token and rotates the cookie", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: "access-1", refresh_token: "refresh-rotated-1" }),
    });

    const res = await POST(makeReq("refresh-old-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accessToken).toBe("access-1");
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("qf_refresh_token=refresh-rotated-1");
    expect(setCookie.toLowerCase()).toContain("httponly");
  });

  it("re-stamps the same refresh token when the provider doesn't rotate", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: "access-2" }),
    });

    const res = await POST(makeReq("refresh-same-2"));
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("qf_refresh_token=refresh-same-2");
  });

  it("returns 401 and clears the cookie on invalid_grant", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "invalid_grant" }),
    });

    const res = await POST(makeReq("refresh-invalid-3"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/session expired/i);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("qf_refresh_token=;");
  });

  it("returns 503 and keeps the cookie on a transient upstream failure", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network error"));

    const res = await POST(makeReq("refresh-transient-4"));
    expect(res.status).toBe(503);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("returns 503 for a non-invalid_grant error response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "server_error" }),
    });

    const res = await POST(makeReq("refresh-servererr-5"));
    expect(res.status).toBe(503);
  });

  it("does not cache a transient failure, so a retry hits the token endpoint again", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network error"));
    const first = await POST(makeReq("refresh-retry-6"));
    expect(first.status).toBe(503);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: "access-6", refresh_token: "refresh-rotated-6" }),
    });
    const second = await POST(makeReq("refresh-retry-6"));
    expect(second.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("coalesces concurrent requests for the same token into a single upstream call", async () => {
    let resolveFetch!: (value: unknown) => void;
    mockFetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
    );

    const p1 = POST(makeReq("refresh-concurrent-7"));
    const p2 = POST(makeReq("refresh-concurrent-7"));

    resolveFetch({
      ok: true,
      json: async () => ({ access_token: "access-7", refresh_token: "refresh-rotated-7" }),
    });

    const [res1, res2] = await Promise.all([p1, p2]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
  });

  it("serves a just-completed result to a request arriving right after, without a second upstream call", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: "access-8", refresh_token: "refresh-rotated-8" }),
    });

    const first = await POST(makeReq("refresh-cached-8"));
    expect(first.status).toBe(200);

    const second = await POST(makeReq("refresh-cached-8"));
    expect(second.status).toBe(200);
    const secondBody = await second.json();
    expect(secondBody.accessToken).toBe("access-8");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
