import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { User } from "@/lib/infra/db/schema";

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock("@/lib/auth/social-auth", () => ({
  requireUser: vi.fn(),
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
        if (prop === "catch")
          return (rej: (e: unknown) => unknown) => Promise.resolve(resolveWith).catch(rej);
        if (prop === Symbol.toStringTag) return "MockChain";
        return () => chain;
      },
      apply() {
        return chain;
      },
    }
  );
  return chain;
}

const { mockSelect } = vi.hoisted(() => ({
  mockSelect: vi.fn(() => makeDbChain([])),
}));

vi.mock("@/lib/infra/db", () => ({
  db: {
    select: mockSelect,
    insert: vi.fn(() => makeDbChain([])),
    update: vi.fn(() => makeDbChain([])),
  },
}));

import { GET } from "@/app/api/social/leaderboard/route";
import { requireUser } from "@/lib/auth/social-auth";

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    qfId: "qf-1",
    username: "testuser",
    displayName: null,
    createdAt: new Date(),
    lastActiveAt: new Date(),
    currentStreak: 5,
    longestStreak: 10,
    lastActivityDate: null,
    disabledAt: null,
    ...overrides,
  };
}

function authedAs(user: User) {
  vi.mocked(requireUser).mockResolvedValue({ userId: user.id, user });
}

function makeReq() {
  return new NextRequest("http://localhost/api/social/leaderboard", {
    headers: { Authorization: "Bearer valid-token" },
  });
}

const today = new Date().toISOString().slice(0, 10);

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("GET /api/social/leaderboard", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockReset();
    mockSelect.mockReturnValue(makeDbChain([]));
  });

  it("returns 401 when unauthorized", async () => {
    vi.mocked(requireUser).mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    );
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });

  it("returns { items, hasMore }", async () => {
    authedAs(makeUser({ id: 1 }));
    mockSelect
      .mockReturnValueOnce(makeDbChain([]))
      .mockReturnValueOnce(
        makeDbChain([
          { id: 1, username: "testuser", displayName: null, currentStreak: 5, longestStreak: 10 },
        ])
      );
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.hasMore).toBe(false);
  });

  it("self is included on leaderboard with isYou: true", async () => {
    authedAs(makeUser({ id: 1, username: "testuser" }));
    mockSelect
      .mockReturnValueOnce(makeDbChain([]))
      .mockReturnValueOnce(
        makeDbChain([
          { id: 1, username: "testuser", displayName: null, currentStreak: 5, longestStreak: 10 },
        ])
      );
    const res = await GET(makeReq());
    const body = await res.json();
    const selfRow = body.items.find((r: { id: number }) => r.id === 1);
    expect(selfRow).toBeDefined();
    expect(selfRow.isYou).toBe(true);
  });

  it("includes rank, streak, and longestStreak fields", async () => {
    authedAs(makeUser({ id: 1 }));
    mockSelect.mockReturnValueOnce(makeDbChain([])).mockReturnValueOnce(
      makeDbChain([
        {
          id: 1,
          username: "testuser",
          displayName: null,
          currentStreak: 7,
          longestStreak: 12,
          lastActivityDate: today,
        },
      ])
    );
    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.items[0]).toMatchObject({
      rank: 1,
      streak: 7,
      longestStreak: 12,
      isYou: true,
    });
  });

  it("decays a broken streak to 0 so it ranks below an active one", async () => {
    authedAs(makeUser({ id: 1 }));
    mockSelect
      .mockReturnValueOnce(makeDbChain([{ requesterId: 1, addresseeId: 2 }]))
      .mockReturnValueOnce(
        makeDbChain([
          // Friend's stored streak is 30 but last activity was long ago → effective 0.
          {
            id: 2,
            username: "stale",
            displayName: null,
            currentStreak: 30,
            longestStreak: 30,
            lastActivityDate: "2000-01-01",
          },
          // Self is active today with a smaller streak → should rank first.
          {
            id: 1,
            username: "testuser",
            displayName: null,
            currentStreak: 3,
            longestStreak: 3,
            lastActivityDate: today,
          },
        ])
      );
    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.items[0]).toMatchObject({ id: 1, rank: 1, streak: 3 });
    expect(body.items[1]).toMatchObject({ id: 2, rank: 2, streak: 0 });
  });

  it("breaks ties deterministically by longest streak then username", async () => {
    authedAs(makeUser({ id: 1 }));
    mockSelect
      .mockReturnValueOnce(makeDbChain([{ requesterId: 1, addresseeId: 2 }]))
      .mockReturnValueOnce(
        makeDbChain([
          {
            id: 1,
            username: "zoe",
            displayName: null,
            currentStreak: 5,
            longestStreak: 5,
            lastActivityDate: today,
          },
          {
            id: 2,
            username: "amy",
            displayName: null,
            currentStreak: 5,
            longestStreak: 9,
            lastActivityDate: today,
          },
        ])
      );
    const res = await GET(makeReq());
    const body = await res.json();
    // Equal current streak → higher longest streak wins.
    expect(body.items[0]).toMatchObject({ id: 2, rank: 1 });
    expect(body.items[1]).toMatchObject({ id: 1, rank: 2 });
  });

  it("friends are included alongside self", async () => {
    authedAs(makeUser({ id: 1 }));
    mockSelect
      .mockReturnValueOnce(makeDbChain([{ requesterId: 1, addresseeId: 2 }]))
      .mockReturnValueOnce(
        makeDbChain([
          { id: 2, username: "friend99", displayName: null, currentStreak: 10, longestStreak: 15 },
          { id: 1, username: "testuser", displayName: null, currentStreak: 5, longestStreak: 10 },
        ])
      );
    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.items).toHaveLength(2);
    const friendRow = body.items.find((r: { id: number }) => r.id === 2);
    expect(friendRow).toBeDefined();
    expect(friendRow.isYou).toBe(false);
    expect(friendRow.username).toBe("friend99");
  });

  it("paginates via limit/offset and reports hasMore", async () => {
    authedAs(makeUser({ id: 1 }));
    const rows = Array.from({ length: 3 }, (_, i) => ({
      id: i + 1,
      username: `user${i + 1}`,
      displayName: null,
      currentStreak: 10 - i,
      longestStreak: 10 - i,
      lastActivityDate: today,
    }));
    mockSelect.mockReturnValueOnce(makeDbChain([])).mockReturnValueOnce(makeDbChain(rows));

    const req = new NextRequest("http://localhost/api/social/leaderboard?limit=2&offset=0", {
      headers: { Authorization: "Bearer valid-token" },
    });
    const res = await GET(req);
    const body = await res.json();
    expect(body.items).toHaveLength(2);
    expect(body.hasMore).toBe(true);
    expect(body.items[0].rank).toBe(1);
    expect(body.items[1].rank).toBe(2);
  });

  it("hasMore is false on the last page", async () => {
    authedAs(makeUser({ id: 1 }));
    const rows = Array.from({ length: 3 }, (_, i) => ({
      id: i + 1,
      username: `user${i + 1}`,
      displayName: null,
      currentStreak: 10 - i,
      longestStreak: 10 - i,
      lastActivityDate: today,
    }));
    mockSelect.mockReturnValueOnce(makeDbChain([])).mockReturnValueOnce(makeDbChain(rows));

    const req = new NextRequest("http://localhost/api/social/leaderboard?limit=2&offset=2", {
      headers: { Authorization: "Bearer valid-token" },
    });
    const res = await GET(req);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.hasMore).toBe(false);
    expect(body.items[0].rank).toBe(3);
  });
});
