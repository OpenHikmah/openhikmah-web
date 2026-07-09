import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { User } from "@/lib/infra/db/schema";

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock("@/lib/auth/social-auth", () => ({
  requireUser: vi.fn(),
  invalidateTokenCache: vi.fn(),
}));

// Drizzle query-chain mock: every method returns a chainable thenable
function makeDbChain(resolveWith: unknown = undefined) {
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

// Use vi.hoisted so mock fns are defined before vi.mock factories run
const { mockInsert, mockUpdate, mockTxSelect, mockTransaction, mockRateLimitOrNull } = vi.hoisted(
  () => {
    const insert = vi.fn(() => makeDbChain());
    const update = vi.fn(() => makeDbChain());
    const txSelect = vi.fn(() => makeDbChain([]));
    // The route does insert + streak read/compute/write inside a
    // db.transaction(async (tx) => ...) — the tx object exposes the same
    // insert/update/select surface, reusing the same mocks so existing test
    // expectations (mockInsert/mockUpdate called, etc.) still hold.
    const transaction = vi.fn(async (cb: (tx: unknown) => unknown) =>
      cb({ insert, update, select: txSelect })
    );
    return {
      mockInsert: insert,
      mockUpdate: update,
      mockTxSelect: txSelect,
      mockTransaction: transaction,
      mockRateLimitOrNull: vi.fn(async (): Promise<NextResponse | null> => null),
    };
  }
);

vi.mock("@/lib/infra/db", () => ({
  db: {
    insert: mockInsert,
    update: mockUpdate,
    select: vi.fn(() => makeDbChain([])),
    transaction: mockTransaction,
  },
}));
vi.mock("@/lib/infra/rate-limit", () => ({
  rateLimitOrNull: mockRateLimitOrNull,
  MUTATION_WINDOW_SECONDS: 600,
}));

import { POST, GET } from "@/app/api/social/activity/route";
import { requireUser } from "@/lib/auth/social-auth";

// ── Helpers ────────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function yesterdayStr() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
function twoDaysAgoStr() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 2);
  return d.toISOString().slice(0, 10);
}

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    qfId: "qf-1",
    username: "testuser",
    displayName: null,
    createdAt: new Date(),
    lastActiveAt: new Date(),
    currentStreak: 3,
    longestStreak: 5,
    lastActivityDate: null,
    disabledAt: null,
    ...overrides,
  };
}

function authedAs(user: User) {
  vi.mocked(requireUser).mockResolvedValue({ userId: user.id, user });
  // The route re-reads the user row inside the transaction (row lock) instead
  // of trusting the cached `authed.user` snapshot — keep the two in sync for
  // tests that don't care about the staleness race itself.
  mockTxSelect.mockReturnValue(makeDbChain([user]));
}

function makeReq(body: object, token = "valid-token") {
  return new NextRequest("http://localhost/api/social/activity", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}

function makeGetReq(token = "valid-token") {
  return new NextRequest("http://localhost/api/social/activity", {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("POST /api/social/activity", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockReset();
    mockInsert.mockReturnValue(makeDbChain());
    mockUpdate.mockReturnValue(makeDbChain());
    mockTxSelect.mockReturnValue(makeDbChain([]));
    mockTransaction.mockClear();
    mockRateLimitOrNull.mockReset();
    mockRateLimitOrNull.mockResolvedValue(null);
  });

  it("returns 401 when requireUser returns 401 response", async () => {
    vi.mocked(requireUser).mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    );
    const res = await POST(makeReq({ type: "verse_added" }));
    expect(res.status).toBe(401);
  });

  it("returns 429 when the per-user activity rate limit is exceeded", async () => {
    authedAs(makeUser());
    mockRateLimitOrNull.mockResolvedValue(
      NextResponse.json({ error: "Too many" }, { status: 429 })
    );
    const res = await POST(makeReq({ type: "verse_added" }));
    expect(res.status).toBe(429);
  });

  it("returns 400 for missing activity type", async () => {
    authedAs(makeUser());
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid activity type/i);
  });

  it("returns 400 for invalid activity type", async () => {
    authedAs(makeUser());
    const res = await POST(makeReq({ type: "unknown_type" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for malformed JSON body", async () => {
    authedAs(makeUser());
    const req = new NextRequest("http://localhost/api/social/activity", {
      method: "POST",
      headers: { Authorization: "Bearer valid-token" },
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("same day: isNewDay false, streak unchanged", async () => {
    authedAs(makeUser({ currentStreak: 4, lastActivityDate: todayStr() }));
    const res = await POST(makeReq({ type: "verse_added" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isNewDay).toBe(false);
    expect(body.streak).toBe(4);
  });

  it("yesterday: isNewDay true, streak increments by 1", async () => {
    authedAs(makeUser({ currentStreak: 3, longestStreak: 5, lastActivityDate: yesterdayStr() }));
    const res = await POST(makeReq({ type: "connection_made" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isNewDay).toBe(true);
    expect(body.streak).toBe(4);
    expect(body.streakBroken).toBe(false);
  });

  it("yesterday: longest streak updated when streak exceeds it", async () => {
    authedAs(makeUser({ currentStreak: 5, longestStreak: 5, lastActivityDate: yesterdayStr() }));
    const res = await POST(makeReq({ type: "verse_added" }));
    const body = await res.json();
    expect(body.streak).toBe(6);
    expect(body.longestStreak).toBe(6);
  });

  it("gap: isNewDay true, streak resets to 1", async () => {
    authedAs(makeUser({ currentStreak: 7, lastActivityDate: twoDaysAgoStr() }));
    const res = await POST(makeReq({ type: "verse_added" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isNewDay).toBe(true);
    expect(body.streak).toBe(1);
    expect(body.streakBroken).toBe(true);
  });

  it("first activity ever (null lastDate): streak set to 1", async () => {
    authedAs(makeUser({ currentStreak: 0, lastActivityDate: null }));
    const res = await POST(makeReq({ type: "hadith_read", verse_ref: "bukhari:1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.streak).toBe(1);
    expect(body.isNewDay).toBe(true);
  });

  it("accepts all valid activity types", async () => {
    for (const type of ["verse_added", "connection_made", "hadith_read"]) {
      authedAs(makeUser());
      const res = await POST(makeReq({ type }));
      expect(res.status).toBe(200);
    }
  });

  it("computes the streak from the freshly re-read (locked) user row, not the cached snapshot", async () => {
    // authed.user (from requireUser, possibly a stale cache) says streak=3,
    // but a concurrent request already bumped it to 9 in the DB — the fix
    // must use the fresh row, not the stale cached one.
    authedAs(makeUser({ currentStreak: 3, longestStreak: 3, lastActivityDate: yesterdayStr() }));
    mockTxSelect.mockReturnValue(
      makeDbChain([
        makeUser({ currentStreak: 9, longestStreak: 9, lastActivityDate: yesterdayStr() }),
      ])
    );
    const res = await POST(makeReq({ type: "verse_added" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.streak).toBe(10);
  });

  it("runs the insert and streak update inside a single transaction", async () => {
    authedAs(makeUser({ currentStreak: 1, lastActivityDate: yesterdayStr() }));
    await POST(makeReq({ type: "verse_added" }));
    expect(mockTransaction).toHaveBeenCalledOnce();
  });
});

describe("GET /api/social/activity", () => {
  beforeEach(() => vi.mocked(requireUser).mockReset());

  it("returns 401 when unauthorized", async () => {
    vi.mocked(requireUser).mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    );
    const res = await GET(makeGetReq());
    expect(res.status).toBe(401);
  });

  it("returns current streak data", async () => {
    authedAs(makeUser({ currentStreak: 7, longestStreak: 14, lastActivityDate: todayStr() }));
    const res = await GET(makeGetReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.streak).toBe(7);
    expect(body.longestStreak).toBe(14);
    expect(body.lastActivityDate).toBe(todayStr());
  });
});
