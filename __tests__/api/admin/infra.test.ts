import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { User } from "@/lib/infra/db/schema";

vi.mock("@/lib/admin/admin-auth", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/admin/admin-audit", () => ({ logAdminAction: vi.fn() }));

function makeDbChain(resolveWith: unknown = []) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = new Proxy(
    function () {
      return chain;
    },
    {
      get(_t, prop) {
        if (prop === "then")
          return (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
            Promise.resolve(resolveWith).then(res, rej);
        return () => chain;
      },
      apply() {
        return chain;
      },
    }
  );
  return chain;
}

const { mockCount, mockDelete } = vi.hoisted(() => ({
  mockCount: vi.fn(() => Promise.resolve(0)),
  mockDelete: vi.fn(() => makeDbChain([])),
}));
vi.mock("@/lib/infra/db", () => ({ db: { $count: mockCount, delete: mockDelete } }));

const { mockRedisEnabled, mockGetRedis } = vi.hoisted(() => ({
  mockRedisEnabled: vi.fn(() => false),
  mockGetRedis: vi.fn(() => null),
}));
vi.mock("@/lib/infra/redis", () => ({ redisEnabled: mockRedisEnabled, getRedis: mockGetRedis }));

const { mockCounterSnapshot, mockUptimeSeconds } = vi.hoisted(() => ({
  mockCounterSnapshot: vi.fn(() => ({})),
  mockUptimeSeconds: vi.fn(() => 123),
}));
vi.mock("@/lib/infra/metrics", () => ({
  counterSnapshot: mockCounterSnapshot,
  uptimeSeconds: mockUptimeSeconds,
}));

const { mockTokenCache, mockClearTokenCache, mockClearJwksCache } = vi.hoisted(() => ({
  mockTokenCache: new Map(),
  mockClearTokenCache: vi.fn(() => 0),
  mockClearJwksCache: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/lib/auth/social-auth", () => ({
  tokenCache: mockTokenCache,
  clearTokenCache: mockClearTokenCache,
  clearJwksCache: mockClearJwksCache,
}));

import { GET, POST } from "@/app/api/admin/infra/route";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { logAdminAction } from "@/lib/admin/admin-audit";

const admin = { userId: 1, user: { qfId: "qf-admin" } as User };

function get() {
  return new NextRequest("http://localhost/api/admin/infra", {
    headers: { Authorization: "Bearer t" },
  });
}
function post(body: unknown) {
  return new NextRequest("http://localhost/api/admin/infra", {
    method: "POST",
    headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.mocked(requireAdmin).mockResolvedValue(admin);
  mockCount.mockReset();
  mockCount.mockImplementation(() => Promise.resolve(0));
  mockDelete.mockReturnValue(makeDbChain([]));
  mockRedisEnabled.mockReturnValue(false);
  mockGetRedis.mockReturnValue(null);
  mockClearTokenCache.mockClear();
  mockClearJwksCache.mockClear();
  vi.mocked(logAdminAction).mockClear();
});

describe("GET /api/admin/infra", () => {
  it("returns the guard's own response for a non-admin caller", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(
      NextResponse.json({ error: "Not found" }, { status: 404 })
    );
    const res = await GET(get());
    expect(res.status).toBe(404);
  });

  it("returns an infra snapshot with rate limit row count and metrics", async () => {
    mockCount.mockImplementation(() => Promise.resolve(7));
    const res = await GET(get());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rateLimitRows).toBe(7);
    expect(body.uptimeSeconds).toBe(123);
    expect(body.redis).toBe("disabled");
  });

  it('reports redis as "up" when the client responds to ping', async () => {
    mockRedisEnabled.mockReturnValue(true);
    mockGetRedis.mockReturnValue({ ping: vi.fn().mockResolvedValue("PONG") } as never);
    const res = await GET(get());
    const body = await res.json();
    expect(body.redis).toBe("up");
  });

  it('reports redis as "down" when ping throws', async () => {
    mockRedisEnabled.mockReturnValue(true);
    mockGetRedis.mockReturnValue({ ping: vi.fn().mockRejectedValue(new Error("x")) } as never);
    const res = await GET(get());
    const body = await res.json();
    expect(body.redis).toBe("down");
  });
});

describe("POST /api/admin/infra", () => {
  it("returns 400 for a malformed body", async () => {
    const req = new NextRequest("http://localhost/api/admin/infra", {
      method: "POST",
      headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
      body: "not-json",
    });
    expect((await POST(req)).status).toBe(400);
  });

  it("returns 400 for an unknown action", async () => {
    const res = await POST(post({ action: "bogus" }));
    expect(res.status).toBe(400);
  });

  it("flushes the token cache and logs the action", async () => {
    mockClearTokenCache.mockReturnValue(5);
    const res = await POST(post({ action: "flush-tokens" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cleared).toBe(5);
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "infra.flush-tokens" })
    );
  });

  it("flushes the JWKS cache", async () => {
    const res = await POST(post({ action: "flush-jwks" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(mockClearJwksCache).toHaveBeenCalled();
  });

  it("resets rate limits and reports the deleted count", async () => {
    mockDelete.mockReturnValue(makeDbChain([{ key: "a" }, { key: "b" }]));
    const res = await POST(post({ action: "reset-ratelimits" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBe(2);
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "infra.reset-ratelimits" })
    );
  });
});
