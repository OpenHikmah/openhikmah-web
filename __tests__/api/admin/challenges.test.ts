import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { User } from "@/lib/infra/db/schema";

vi.mock("@/lib/admin/admin-auth", () => ({
  requireAdmin: vi.fn(),
  rateLimitAdminMutation: vi.fn(() => null),
}));
vi.mock("@/lib/admin/admin-audit", () => ({ logAdminAction: vi.fn() }));
vi.mock("@/lib/social/challenges", () => ({
  scoreChallenge: vi.fn(async () => 0),
  scoreBoth: vi.fn(async () => ({ challengerScore: 0, challengedScore: 0 })),
  scoresForDisplay: vi.fn(async () => new Map()),
  pickWinner: vi.fn(() => 1),
  resolveEndedChallenges: vi.fn(
    async () => new Map([[1, { challengerScore: 1, challengedScore: 0 }]])
  ),
  resolveExpiredPending: vi.fn(async () => 0),
}));

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

const { mockSelect, mockUpdate, mockDelete } = vi.hoisted(() => ({
  mockSelect: vi.fn(() => makeDbChain([])),
  mockUpdate: vi.fn(() => makeDbChain([])),
  mockDelete: vi.fn(() => makeDbChain([])),
}));
vi.mock("@/lib/infra/db", () => ({
  db: { select: mockSelect, update: mockUpdate, delete: mockDelete },
}));

import { PATCH, DELETE } from "@/app/api/admin/challenges/[id]/route";
import { POST as FINALIZE } from "@/app/api/admin/challenges/finalize/route";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { scoreBoth } from "@/lib/social/challenges";

const admin = { userId: 1, user: { qfId: "qf-admin" } as User };
const challenge = { id: 1, challengerId: 1, challengedId: 2, status: "active", endsAt: new Date() };

function req(method: string, body?: unknown) {
  return new NextRequest("http://localhost/api/admin/challenges/1", {
    method,
    headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const params = { params: Promise.resolve({ id: "1" }) };

beforeEach(() => {
  vi.mocked(requireAdmin).mockResolvedValue(admin);
  mockSelect.mockReturnValue(makeDbChain([challenge]));
  mockUpdate.mockReturnValue(makeDbChain([{ ...challenge, status: "completed" }]));
  mockDelete.mockReturnValue(makeDbChain([challenge]));
});

describe("admin challenges [id]", () => {
  it("404s for a non-admin", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(
      NextResponse.json({ error: "Not found" }, { status: 404 })
    );
    expect((await PATCH(req("PATCH", { action: "end" }), params)).status).toBe(404);
  });

  it("ends an active challenge", async () => {
    const res = await PATCH(req("PATCH", { action: "end" }), params);
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalled();
  });

  describe("end scores at the real end time", () => {
    beforeEach(() => vi.mocked(scoreBoth).mockClear());

    function captureSet() {
      const set = vi.fn(() => makeDbChain([{ ...challenge, status: "completed" }]));
      mockUpdate.mockReturnValue({ set } as unknown as ReturnType<typeof mockUpdate>);
      return set;
    }

    it("keeps an already-passed endsAt for scoring and persistence instead of moving it to now", async () => {
      const pastEnd = new Date(Date.now() - 60 * 60 * 1000);
      mockSelect.mockReturnValue(makeDbChain([{ ...challenge, endsAt: pastEnd }]));
      const set = captureSet();

      const res = await PATCH(req("PATCH", { action: "end" }), params);
      expect(res.status).toBe(200);

      expect(vi.mocked(scoreBoth).mock.calls.map((c) => c[0].endsAt)).toEqual([pastEnd]);
      expect(set).toHaveBeenCalledWith(
        expect.objectContaining({ endsAt: pastEnd, challengerScore: 0, challengedScore: 0 })
      );
    });

    it("ends a not-yet-due challenge at now", async () => {
      const futureEnd = new Date(Date.now() + 60 * 60 * 1000);
      mockSelect.mockReturnValue(makeDbChain([{ ...challenge, endsAt: futureEnd }]));
      const set = captureSet();
      const before = Date.now();

      const res = await PATCH(req("PATCH", { action: "end" }), params);
      expect(res.status).toBe(200);

      const persisted = (set.mock.calls[0] as unknown as [{ endsAt: Date }])[0].endsAt;
      expect(persisted.getTime()).toBeGreaterThanOrEqual(before);
      expect(persisted.getTime()).toBeLessThan(futureEnd.getTime());
      expect(vi.mocked(scoreBoth).mock.calls[0][0].endsAt).toBe(persisted);
    });
  });

  it("rejects ending a non-active challenge", async () => {
    mockSelect.mockReturnValue(makeDbChain([{ ...challenge, status: "completed" }]));
    expect((await PATCH(req("PATCH", { action: "end" }), params)).status).toBe(409);
  });

  it("rejects override-winner with a non-participant id", async () => {
    expect(
      (await PATCH(req("PATCH", { action: "override-winner", winnerId: 999 }), params)).status
    ).toBe(400);
  });

  it("accepts override-winner with null (draw)", async () => {
    const res = await PATCH(req("PATCH", { action: "override-winner", winnerId: null }), params);
    expect(res.status).toBe(200);
  });

  it("accepts override-winner on an already-completed challenge (correcting a mistaken result)", async () => {
    mockSelect.mockReturnValue(makeDbChain([{ ...challenge, status: "completed" }]));
    const res = await PATCH(
      req("PATCH", { action: "override-winner", winnerId: challenge.challengerId }),
      params
    );
    expect(res.status).toBe(200);
  });

  it.each(["pending", "declined", "cancelled"])(
    "rejects override-winner on a %s challenge",
    async (status) => {
      mockSelect.mockReturnValue(makeDbChain([{ ...challenge, status }]));
      const res = await PATCH(req("PATCH", { action: "override-winner", winnerId: null }), params);
      expect(res.status).toBe(409);
    }
  );

  it("409s when override-winner races a concurrent status change", async () => {
    mockUpdate.mockReturnValue(makeDbChain([])); // scoped update matched nothing
    const res = await PATCH(req("PATCH", { action: "override-winner", winnerId: null }), params);
    expect(res.status).toBe(409);
  });

  it("409s when two override-winner corrections race on an already-completed challenge", async () => {
    // Status alone can't detect this race (it stays "completed" throughout),
    // so the scoped update must also pin the previously-read winnerId.
    mockSelect.mockReturnValue(makeDbChain([{ ...challenge, status: "completed", winnerId: 1 }]));
    mockUpdate.mockReturnValue(makeDbChain([])); // winnerId changed underneath us, scoped update matched nothing
    const res = await PATCH(
      req("PATCH", { action: "override-winner", winnerId: challenge.challengedId }),
      params
    );
    expect(res.status).toBe(409);
  });

  it("rejects an unknown action", async () => {
    expect((await PATCH(req("PATCH", { action: "nope" }), params)).status).toBe(400);
  });

  it("409s when a concurrent request already ended the challenge before this update lands", async () => {
    mockUpdate.mockReturnValue(makeDbChain([])); // scoped update matched nothing (status changed underneath us)
    expect((await PATCH(req("PATCH", { action: "end" }), params)).status).toBe(409);
  });

  it("voids a challenge (204)", async () => {
    expect((await DELETE(req("DELETE"), params)).status).toBe(204);
  });

  it("404s voiding a missing challenge", async () => {
    mockDelete.mockReturnValue(makeDbChain([]));
    expect((await DELETE(req("DELETE"), params)).status).toBe(404);
  });

  it("returns 500 (not a raw stack) when the PATCH update throws", async () => {
    mockUpdate.mockImplementation(() => {
      throw new Error("db down");
    });
    const res = await PATCH(req("PATCH", { action: "end" }), params);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal server error" });
  });

  it("returns 500 (not a raw stack) when the DELETE throws", async () => {
    mockDelete.mockImplementation(() => {
      throw new Error("db down");
    });
    const res = await DELETE(req("DELETE"), params);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal server error" });
  });
});

describe("admin challenges finalize", () => {
  it("returns the resolved count", async () => {
    mockSelect.mockReturnValue(makeDbChain([challenge]));
    const res = await FINALIZE(
      new NextRequest("http://localhost/api/admin/challenges/finalize", {
        method: "POST",
        headers: { Authorization: "Bearer t" },
      })
    );
    expect(res.status).toBe(200);
    expect((await res.json()).resolved).toBe(1);
  });
});
