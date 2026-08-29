import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { User } from "@/lib/infra/db/schema";

const { mockRateLimitAdminMutation } = vi.hoisted(() => ({
  mockRateLimitAdminMutation: vi.fn<() => Promise<NextResponse | null>>(async () => null),
}));
vi.mock("@/lib/admin/admin-auth", () => ({
  requireAdmin: vi.fn(),
  rateLimitAdminMutation: mockRateLimitAdminMutation,
}));

const { mockResolveEndedChallenges, mockResolveExpiredPending } = vi.hoisted(() => ({
  mockResolveEndedChallenges: vi.fn(async () => new Map()),
  mockResolveExpiredPending: vi.fn(async () => 0),
}));
vi.mock("@/lib/social/challenges", () => ({
  scoreChallenge: vi.fn(async () => 0),
  pickWinner: vi.fn(() => 1),
  resolveEndedChallenges: mockResolveEndedChallenges,
  resolveExpiredPending: mockResolveExpiredPending,
  mapWithConcurrency: async (
    items: unknown[],
    _limit: number,
    fn: (item: unknown) => Promise<void>
  ) => {
    for (const item of items) await fn(item);
  },
}));

function makeSelectChain(resolveWith: unknown, calls?: Array<[string, unknown[]]>) {
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
        return (...args: unknown[]) => {
          calls?.push([String(prop), args]);
          return chain;
        };
      },
      apply() {
        return chain;
      },
    }
  );
  return chain;
}

const { mockSelect } = vi.hoisted(() => ({ mockSelect: vi.fn() }));
vi.mock("@/lib/infra/db", () => ({ db: { select: mockSelect } }));

import { GET } from "@/app/api/admin/challenges/route";
import { requireAdmin } from "@/lib/admin/admin-auth";

const admin = { userId: 1, user: { qfId: "qf-admin" } as User };

function req(query?: string) {
  const url = query
    ? `http://localhost/api/admin/challenges?${query}`
    : "http://localhost/api/admin/challenges";
  return new NextRequest(url, { headers: { Authorization: "Bearer t" } });
}

/** Order matches route.ts: ended, expiredPending, statusCounts, fromSuggestions, rows, users. */
function queueSelects(
  ended: unknown[],
  expiredPending: unknown[],
  rows: unknown[] = [],
  listCalls?: Array<[string, unknown[]]>
) {
  mockSelect
    .mockReturnValueOnce(makeSelectChain(ended))
    .mockReturnValueOnce(makeSelectChain(expiredPending))
    .mockReturnValueOnce(makeSelectChain([]))
    .mockReturnValueOnce(makeSelectChain([{ fromSuggestions: 0 }]))
    .mockReturnValueOnce(makeSelectChain(rows, listCalls))
    .mockReturnValueOnce(makeSelectChain([]));
}

beforeEach(() => {
  vi.mocked(requireAdmin).mockResolvedValue(admin);
  mockRateLimitAdminMutation.mockReset().mockResolvedValue(null);
  mockSelect.mockReset();
  mockResolveEndedChallenges.mockClear();
  mockResolveExpiredPending.mockClear();
});

describe("GET /api/admin/challenges", () => {
  it("does not rate-limit a plain read with nothing to self-heal", async () => {
    queueSelects([], []);
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(mockRateLimitAdminMutation).not.toHaveBeenCalled();
  });

  it("rate-limits when there are ended challenges to self-heal", async () => {
    queueSelects([{ id: 1, status: "active" }], []);
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(mockRateLimitAdminMutation).toHaveBeenCalledWith(admin);
  });

  it("rate-limits when there are expired pending invites to self-heal", async () => {
    queueSelects([], [{ id: 2, status: "pending" }]);
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(mockRateLimitAdminMutation).toHaveBeenCalledWith(admin);
  });

  it("returns the rate-limit response and skips self-heal writes when throttled", async () => {
    queueSelects([{ id: 1, status: "active" }], []);
    mockRateLimitAdminMutation.mockResolvedValue(
      NextResponse.json({ error: "Too many admin actions — try again later" }, { status: 429 })
    );
    const res = await GET(req());
    expect(res.status).toBe(429);
    expect(mockResolveEndedChallenges).not.toHaveBeenCalled();
    expect(mockResolveExpiredPending).not.toHaveBeenCalled();
  });

  it("rate-limits a challenge that turns overdue between the ended-select and the list-select", async () => {
    // Nothing in `ended`/`expiredPending`, but a `rows` entry is active and
    // already past its endsAt — it slipped past the earlier gate.
    const overdue = { id: 3, status: "active", endsAt: new Date(Date.now() - 1000) };
    queueSelects([], [], [overdue]);
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(mockRateLimitAdminMutation).toHaveBeenCalledWith(admin);
  });

  it("does not double rate-limit when the earlier gate already checked", async () => {
    const overdue = { id: 3, status: "active", endsAt: new Date(Date.now() - 1000) };
    queueSelects([{ id: 1, status: "active" }], [], [overdue]);
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(mockRateLimitAdminMutation).toHaveBeenCalledTimes(1);
  });

  it("caps the list page and reports hasMore when an extra row is returned", async () => {
    const many = Array.from({ length: 51 }, (_, i) => ({
      id: i + 1,
      status: "pending",
      challengerId: 1,
      challengedId: 2,
      endsAt: new Date(Date.now() + 1000),
    }));
    queueSelects([], [], many);
    const body = await (await GET(req())).json();
    expect(body.challenges).toHaveLength(50);
    expect(body.hasMore).toBe(true);
  });

  it("passes the requested offset through to the list query", async () => {
    const listCalls: Array<[string, unknown[]]> = [];
    queueSelects([], [], [], listCalls);
    await GET(req("offset=50"));
    expect(listCalls).toContainEqual(["offset", [50]]);
  });
});
