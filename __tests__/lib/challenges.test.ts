import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Challenge } from "@/lib/db/schema";

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

const { mockSelect, mockUpdate } = vi.hoisted(() => ({
  mockSelect: vi.fn(() => makeDbChain([])),
  mockUpdate: vi.fn(() => makeDbChain([])),
}));
vi.mock("@/lib/db", () => ({ db: { select: mockSelect, update: mockUpdate } }));

import {
  pickWinner,
  resolveEndedChallenges,
  resolveExpiredPending,
  isDuration,
  DURATIONS,
} from "@/lib/challenges";

function makeChallenge(overrides: Partial<Challenge> = {}): Challenge {
  return {
    id: 1,
    challengerId: 1,
    challengedId: 2,
    verseRef: null,
    activityType: "connection_made",
    status: "active",
    suggestionId: null,
    startsAt: new Date(Date.now() - 86_400_000),
    endsAt: new Date(Date.now() - 1000),
    winnerId: null,
    createdAt: new Date(),
    ...overrides,
  } as Challenge;
}

describe("pickWinner", () => {
  const c = makeChallenge();
  it("returns the challenger when they score higher", () => {
    expect(pickWinner(c, 5, 2)).toBe(c.challengerId);
  });
  it("returns the challenged when they score higher", () => {
    expect(pickWinner(c, 1, 4)).toBe(c.challengedId);
  });
  it("returns null on a tie", () => {
    expect(pickWinner(c, 3, 3)).toBeNull();
  });
});

describe("isDuration / DURATIONS", () => {
  it("accepts only known tokens", () => {
    expect(isDuration("24h")).toBe(true);
    expect(isDuration("7d")).toBe(true);
    expect(isDuration("3d")).toBe(false);
    expect(DURATIONS["48h"]).toBe(48 * 60 * 60 * 1000);
  });
});

describe("resolveEndedChallenges", () => {
  beforeEach(() => {
    // Full reset so a prior test's `mockReturnValueOnce` queue / call history
    // never leaks into the next.
    mockSelect.mockReset();
    mockUpdate.mockReset();
    mockSelect.mockReturnValue(makeDbChain([{ score: 0 }]));
    // Default: the guarded update matches (simulates no concurrent writer).
    mockUpdate.mockReturnValue(makeDbChain([{ id: 0 }]));
  });

  it("finalizes an ended active challenge, sets winner, and mutates the row", async () => {
    mockSelect
      .mockReturnValueOnce(makeDbChain([{ score: 4 }])) // challenger
      .mockReturnValueOnce(makeDbChain([{ score: 1 }])); // challenged
    const rows = [makeChallenge({ id: 7 })];
    const resolved = await resolveEndedChallenges(rows, new Date());
    expect(mockUpdate).toHaveBeenCalledOnce();
    expect(rows[0].status).toBe("completed");
    expect(rows[0].winnerId).toBe(1);
    expect(resolved.get(7)).toEqual({ challengerScore: 4, challengedScore: 1 });
  });

  it("ignores active challenges that have not ended", async () => {
    const rows = [makeChallenge({ id: 8, endsAt: new Date(Date.now() + 3_600_000) })];
    const resolved = await resolveEndedChallenges(rows, new Date());
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(resolved.size).toBe(0);
    expect(rows[0].status).toBe("active");
  });

  it("ignores non-active challenges", async () => {
    const rows = [makeChallenge({ id: 9, status: "pending" })];
    const resolved = await resolveEndedChallenges(rows, new Date());
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(resolved.size).toBe(0);
  });

  it("does not mutate the row or count it when a concurrent writer already changed its status (lost race)", async () => {
    // The guarded UPDATE (WHERE id AND status='active') matches nothing
    // because another writer (admin "end", or a second resolver call) already
    // transitioned this row first.
    mockUpdate.mockReturnValue(makeDbChain([]));
    const rows = [makeChallenge({ id: 13 })];
    const resolved = await resolveEndedChallenges(rows, new Date());
    expect(rows[0].status).toBe("active"); // left untouched, not clobbered
    expect(resolved.size).toBe(0);
  });
});

describe("resolveExpiredPending", () => {
  beforeEach(() => {
    mockUpdate.mockReset();
    // Default: the guarded update matches (simulates no concurrent writer).
    mockUpdate.mockReturnValue(makeDbChain([{ id: 0 }]));
  });

  it("declines a pending invite past its endsAt", async () => {
    const rows = [
      makeChallenge({ id: 10, status: "pending", endsAt: new Date(Date.now() - 1000) }),
    ];
    const count = await resolveExpiredPending(rows, new Date());
    expect(mockUpdate).toHaveBeenCalledOnce();
    expect(rows[0].status).toBe("declined");
    expect(count).toBe(1);
  });

  it("ignores pending invites that have not expired", async () => {
    const rows = [
      makeChallenge({ id: 11, status: "pending", endsAt: new Date(Date.now() + 3_600_000) }),
    ];
    const count = await resolveExpiredPending(rows, new Date());
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(rows[0].status).toBe("pending");
    expect(count).toBe(0);
  });

  it("ignores non-pending challenges even past their endsAt", async () => {
    const rows = [makeChallenge({ id: 12, status: "active", endsAt: new Date(Date.now() - 1000) })];
    const count = await resolveExpiredPending(rows, new Date());
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(count).toBe(0);
  });

  it("does not mutate the row or count it when the pair already accepted/declined/cancelled it (lost race)", async () => {
    // The guarded UPDATE (WHERE id AND status='pending') matches nothing
    // because the pair actioned this invite via the (already-guarded) PATCH
    // route in the window between the caller's SELECT and this UPDATE.
    mockUpdate.mockReturnValue(makeDbChain([]));
    const rows = [
      makeChallenge({ id: 14, status: "pending", endsAt: new Date(Date.now() - 1000) }),
    ];
    const count = await resolveExpiredPending(rows, new Date());
    expect(rows[0].status).toBe("pending"); // left untouched, not clobbered
    expect(count).toBe(0);
  });
});
