import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { User } from "@/lib/db/schema";

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock("@/lib/social-auth", () => ({
  requireUser: vi.fn(),
  invalidateTokenCache: vi.fn(),
}));

// Drizzle query-chain mock: every method returns a chainable thenable
function makeDbChain(resolveWith: unknown = undefined) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = new Proxy(
    function () { return chain; },
    {
      get(_t, prop) {
        if (prop === "then") return (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
          Promise.resolve(resolveWith).then(res, rej);
        if (prop === "catch") return (rej: (e: unknown) => unknown) =>
          Promise.resolve(resolveWith).catch(rej);
        if (prop === Symbol.toStringTag) return "MockChain";
        return () => chain;
      },
      apply() { return chain; },
    }
  );
  return chain;
}

// Use vi.hoisted so mock fns are defined before vi.mock factories run
const { mockInsert, mockUpdate } = vi.hoisted(() => ({
  mockInsert: vi.fn(() => makeDbChain()),
  mockUpdate: vi.fn(() => makeDbChain()),
}));

vi.mock("@/lib/db", () => ({
  db: {
    insert: mockInsert,
    update: mockUpdate,
    select: vi.fn(() => makeDbChain([])),
  },
}));

import { POST, GET } from "@/app/api/social/activity/route";
import { requireUser } from "@/lib/social-auth";

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
    ...overrides,
  };
}

function authedAs(user: User) {
  vi.mocked(requireUser).mockResolvedValue({ userId: user.id, user });
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
  });

  it("returns 401 when requireUser returns 401 response", async () => {
    vi.mocked(requireUser).mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    );
    const res = await POST(makeReq({ type: "verse_added" }));
    expect(res.status).toBe(401);
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
