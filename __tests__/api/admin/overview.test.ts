import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { User } from "@/lib/infra/db/schema";

vi.mock("@/lib/admin/admin-auth", () => ({ requireAdmin: vi.fn() }));

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

const { mockSelect, mockCount } = vi.hoisted(() => ({
  mockSelect: vi.fn(() => makeDbChain([])),
  mockCount: vi.fn(() => Promise.resolve(0)),
}));
vi.mock("@/lib/infra/db", () => ({ db: { select: mockSelect, $count: mockCount } }));

const { mockRedisEnabled, mockGetRedis, mockRedisStatus } = vi.hoisted(() => {
  const enabled = vi.fn(() => false);
  const get = vi.fn(() => null);
  return {
    mockRedisEnabled: enabled,
    mockGetRedis: get,
    mockRedisStatus: vi.fn(async () => {
      if (!enabled()) return "disabled";
      const client = get();
      if (!client) return "disabled";
      try {
        const pong = await client.ping();
        return pong === "PONG" ? "up" : "down";
      } catch {
        return "down";
      }
    }),
  };
});
vi.mock("@/lib/infra/redis", () => ({
  redisEnabled: mockRedisEnabled,
  getRedis: mockGetRedis,
  redisStatus: mockRedisStatus,
}));

import { GET } from "@/app/api/admin/overview/route";
import { requireAdmin } from "@/lib/admin/admin-auth";

const admin = { userId: 1, user: { qfId: "qf-admin" } as User };

function req() {
  return new NextRequest("http://localhost/api/admin/overview", {
    headers: { Authorization: "Bearer t" },
  });
}

// The route calls db.$count 6 times, in this literal order:
// totalUsers, disabledUsers, totalConnections, flaggedConnections, curatedTotal, curatedUpcoming
function queueCounts(counts: [number, number, number, number, number, number]) {
  counts.forEach((n) => mockCount.mockImplementationOnce(() => Promise.resolve(n)));
}

beforeEach(() => {
  vi.mocked(requireAdmin).mockResolvedValue(admin);
  mockSelect.mockReturnValue(makeDbChain([{ gens: 0, tokens: 0 }]));
  mockCount.mockReset();
  mockCount.mockImplementation(() => Promise.resolve(0));
  mockRedisEnabled.mockReturnValue(false);
  mockGetRedis.mockReturnValue(null);
});

describe("GET /api/admin/overview", () => {
  it("returns the guard's own response for a non-admin caller", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(
      NextResponse.json({ error: "Not found" }, { status: 404 })
    );
    const res = await GET(req());
    expect(res.status).toBe(404);
  });

  it("aggregates users, connections, votd, and AI stats", async () => {
    queueCounts([100, 5, 40, 3, 30, 2]);
    mockSelect.mockReturnValue(makeDbChain([{ gens: 12, tokens: 4500 }]));

    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.users).toEqual({ total: 100, disabled: 5 });
    expect(body.connections).toEqual({ total: 40, flagged: 3 });
    expect(body.votd).toEqual({ total: 30, upcoming: 2 });
    expect(body.aiMonthToDate).toEqual({ generations: 12, tokens: 4500 });
  });

  it("defaults AI stats to zero when there are no generations this month", async () => {
    mockSelect.mockReturnValue(makeDbChain([]));
    const res = await GET(req());
    const body = await res.json();
    expect(body.aiMonthToDate).toEqual({ generations: 0, tokens: 0 });
  });

  it('reports redis as "disabled" when no Redis client is configured', async () => {
    mockRedisEnabled.mockReturnValue(false);
    const res = await GET(req());
    const body = await res.json();
    expect(body.redis).toBe("disabled");
  });

  it('reports redis as "up" when the client responds to ping', async () => {
    mockRedisEnabled.mockReturnValue(true);
    mockGetRedis.mockReturnValue({ ping: vi.fn().mockResolvedValue("PONG") } as never);
    const res = await GET(req());
    const body = await res.json();
    expect(body.redis).toBe("up");
  });

  it('reports redis as "down" when ping fails', async () => {
    mockRedisEnabled.mockReturnValue(true);
    mockGetRedis.mockReturnValue({
      ping: vi.fn().mockRejectedValue(new Error("timeout")),
    } as never);
    const res = await GET(req());
    const body = await res.json();
    expect(body.redis).toBe("down");
  });
});
