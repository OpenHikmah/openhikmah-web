import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/auth/signout/route";

const { mockInvalidateTokenCache } = vi.hoisted(() => ({
  mockInvalidateTokenCache: vi.fn(),
}));
vi.mock("@/lib/auth/social-auth", () => ({
  invalidateTokenCache: mockInvalidateTokenCache,
}));

function makeReq(bearerToken?: string) {
  return new NextRequest("http://localhost/api/auth/signout", {
    method: "POST",
    headers: bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {},
  });
}

describe("POST /api/auth/signout", () => {
  beforeEach(() => mockInvalidateTokenCache.mockReset());

  it("invalidates the token cache and clears the refresh cookie when a Bearer token is present", async () => {
    const res = await POST(makeReq("access-token-123"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(mockInvalidateTokenCache).toHaveBeenCalledWith("access-token-123");
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("qf_refresh_token=;");
  });

  it("still succeeds and clears the cookie when no Authorization header is present", async () => {
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(mockInvalidateTokenCache).not.toHaveBeenCalled();
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("qf_refresh_token=;");
  });

  it("does not invalidate the cache for a malformed (non-Bearer) Authorization header", async () => {
    const req = new NextRequest("http://localhost/api/auth/signout", {
      method: "POST",
      headers: { Authorization: "Basic sometoken" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockInvalidateTokenCache).not.toHaveBeenCalled();
  });
});
