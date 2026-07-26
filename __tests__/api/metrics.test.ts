import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { User } from "@/lib/infra/db/schema";

vi.mock("@/lib/admin/admin-auth", () => ({
  requireAdmin: vi.fn(),
}));

const { mockExecute } = vi.hoisted(() => ({
  mockExecute: vi.fn(() => Promise.resolve(undefined)),
}));
vi.mock("@/lib/infra/db", () => ({ db: { execute: mockExecute } }));

const { mockRedisEnabled, mockGetRedis } = vi.hoisted(() => ({
  mockRedisEnabled: vi.fn(() => false),
  mockGetRedis: vi.fn<() => { ping: () => Promise<string> } | null>(() => null),
}));
vi.mock("@/lib/infra/redis", () => ({
  redisEnabled: mockRedisEnabled,
  getRedis: mockGetRedis,
}));

const { mockCounterSnapshot, mockUptimeSeconds } = vi.hoisted(() => ({
  mockCounterSnapshot: vi.fn(() => ({ "csp.violation": 3 })),
  mockUptimeSeconds: vi.fn(() => 123),
}));
vi.mock("@/lib/infra/metrics", () => ({
  counterSnapshot: mockCounterSnapshot,
  uptimeSeconds: mockUptimeSeconds,
}));

import { GET } from "@/app/api/metrics/route";
import { requireAdmin } from "@/lib/admin/admin-auth";

const admin = { userId: 1, user: { qfId: "qf-admin" } as User };

function req() {
  return new NextRequest("http://localhost/api/metrics", {
    headers: { Authorization: "Bearer t" },
  });
}

beforeEach(() => {
  vi.mocked(requireAdmin).mockResolvedValue(admin);
  mockExecute.mockReset();
  mockExecute.mockImplementation(() => Promise.resolve(undefined));
  mockRedisEnabled.mockReturnValue(false);
  mockGetRedis.mockReturnValue(null);
});

describe("GET /api/metrics", () => {
  it("returns the guard's own response for a non-admin/unauthenticated caller", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(
      NextResponse.json({ error: "Not found" }, { status: 404 })
    );
    const res = await GET(req());
    expect(res.status).toBe(404);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("returns the metrics snapshot for an admin caller", async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.uptimeSeconds).toBe(123);
    expect(body.counters).toEqual({ "csp.violation": 3 });
    expect(body.db.ok).toBe(true);
  });

  it("reports db as unreachable when the probe query throws", async () => {
    mockExecute.mockRejectedValue(new Error("connection refused"));
    const res = await GET(req());
    const body = await res.json();
    expect(body.db.ok).toBe(false);
  });
});
