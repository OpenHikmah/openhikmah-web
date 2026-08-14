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

function makeSelectChain(resolveWith: unknown) {
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

const { mockSelect } = vi.hoisted(() => ({ mockSelect: vi.fn() }));
vi.mock("@/lib/infra/db", () => ({ db: { select: mockSelect } }));

import { GET } from "@/app/api/admin/challenges/route";
import { requireAdmin } from "@/lib/admin/admin-auth";

const admin = { userId: 1, user: { qfId: "qf-admin" } as User };

function req() {
  return new NextRequest("http://localhost/api/admin/challenges", {
    headers: { Authorization: "Bearer t" },
  });
}

/** Order matches route.ts: ended, expiredPending, statusCounts, fromSuggestions, rows, users. */
function queueSelects(ended: unknown[], expiredPending: unknown[], rows: unknown[] = []) {
  mockSelect
    .mockReturnValueOnce(makeSelectChain(ended))
    .mockReturnValueOnce(makeSelectChain(expiredPending))
    .mockReturnValueOnce(makeSelectChain([]))
    .mockReturnValueOnce(makeSelectChain([{ fromSuggestions: 0 }]))
    .mockReturnValueOnce(makeSelectChain(rows))
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
});
