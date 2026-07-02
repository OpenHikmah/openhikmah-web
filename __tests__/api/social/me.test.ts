import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { User } from "@/lib/db/schema";

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock("@/lib/social-auth", () => ({
  requireUser: vi.fn(),
}));

function makeDbChain(resolveWith: unknown = []) {
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

const { mockSelect, mockUpdate } = vi.hoisted(() => ({
  mockSelect: vi.fn(() => makeDbChain([])),
  mockUpdate: vi.fn(() => makeDbChain([])),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: mockSelect,
    update: mockUpdate,
    insert: vi.fn(() => makeDbChain([])),
  },
}));

import { GET, PATCH } from "@/app/api/social/me/route";
import { requireUser } from "@/lib/social-auth";

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    qfId: "qf-1",
    username: "testuser",
    displayName: "Test User",
    createdAt: new Date("2025-01-01"),
    lastActiveAt: new Date("2025-01-15"),
    currentStreak: 3,
    longestStreak: 7,
    lastActivityDate: new Date().toISOString().slice(0, 10),
    disabledAt: null,
    ...overrides,
  };
}

function authedAs(user: User) {
  vi.mocked(requireUser).mockResolvedValue({ userId: user.id, user });
}

function makeGetReq() {
  return new NextRequest("http://localhost/api/social/me", {
    headers: { Authorization: "Bearer valid-token" },
  });
}

function makePatchReq(body: object) {
  return new NextRequest("http://localhost/api/social/me", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer valid-token",
    },
    body: JSON.stringify(body),
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("GET /api/social/me", () => {
  beforeEach(() => vi.mocked(requireUser).mockReset());

  it("returns 401 when unauthorized", async () => {
    vi.mocked(requireUser).mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    );
    const res = await GET(makeGetReq());
    expect(res.status).toBe(401);
  });

  it("returns user profile fields", async () => {
    const user = makeUser({ username: "scholar99", currentStreak: 10 });
    authedAs(user);
    const res = await GET(makeGetReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.username).toBe("scholar99");
    expect(body.currentStreak).toBe(10);
    expect(body.id).toBe(1);
  });

  it("does not expose qfId in response", async () => {
    authedAs(makeUser());
    const res = await GET(makeGetReq());
    const body = await res.json();
    expect(body.qfId).toBeUndefined();
  });

  it("reports a broken streak as 0 (decay) while keeping longestStreak", async () => {
    authedAs(makeUser({ currentStreak: 30, longestStreak: 30, lastActivityDate: "2000-01-01" }));
    const res = await GET(makeGetReq());
    const body = await res.json();
    expect(body.currentStreak).toBe(0);
    expect(body.longestStreak).toBe(30);
  });
});

describe("PATCH /api/social/me", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockReset();
    mockSelect.mockReturnValue(makeDbChain([]));
    mockUpdate.mockReturnValue(makeDbChain([{ id: 1, username: "newname", displayName: null }]));
  });

  it("returns 401 when unauthorized", async () => {
    vi.mocked(requireUser).mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    );
    const res = await PATCH(makePatchReq({ username: "newname" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when no fields provided", async () => {
    authedAs(makeUser());
    const res = await PATCH(makePatchReq({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/no valid fields/i);
  });

  it("returns 400 for username that is too short", async () => {
    authedAs(makeUser());
    const res = await PATCH(makePatchReq({ username: "ab" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/3.{1,5}20/);
  });

  it("returns 400 for username that is too long", async () => {
    authedAs(makeUser());
    const res = await PATCH(makePatchReq({ username: "a".repeat(21) }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for username with invalid characters", async () => {
    authedAs(makeUser());
    const res = await PATCH(makePatchReq({ username: "bad name!" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for malformed JSON", async () => {
    authedAs(makeUser());
    const req = new NextRequest("http://localhost/api/social/me", {
      method: "PATCH",
      headers: { Authorization: "Bearer valid-token" },
      body: "not-json",
    });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });

  it("returns 409 when username is already taken by another user", async () => {
    authedAs(makeUser({ id: 1 }));
    // Simulate another user (id=99) already having this username
    mockSelect.mockReturnValue(makeDbChain([{ id: 99 }]));
    const res = await PATCH(makePatchReq({ username: "takenname" }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/already taken/i);
  });

  it("allows updating to the same username (no collision)", async () => {
    authedAs(makeUser({ id: 1, username: "myname" }));
    // Same user id in collision check = allowed
    mockSelect.mockReturnValue(makeDbChain([{ id: 1 }]));
    mockUpdate.mockReturnValue(makeDbChain([{ id: 1, username: "myname", displayName: null }]));
    const res = await PATCH(makePatchReq({ username: "myname" }));
    expect(res.status).toBe(200);
  });

  it("returns updated profile on success", async () => {
    authedAs(makeUser());
    mockSelect.mockReturnValue(makeDbChain([]));
    mockUpdate.mockReturnValue(makeDbChain([{ id: 1, username: "scholar_one", displayName: null }]));
    const res = await PATCH(makePatchReq({ username: "scholar_one" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.username).toBe("scholar_one");
  });

  it("accepts valid username formats", async () => {
    const validNames = ["abc", "ABC", "user_123", "a".repeat(20)];
    for (const username of validNames) {
      authedAs(makeUser());
      mockSelect.mockReturnValue(makeDbChain([]));
      mockUpdate.mockReturnValue(makeDbChain([{ id: 1, username, displayName: null }]));
      const res = await PATCH(makePatchReq({ username }));
      expect(res.status).toBe(200);
    }
  });

  it("returns 409 (not 500) when a concurrent PATCH wins the username race", async () => {
    authedAs(makeUser({ id: 1 }));
    // The collision pre-check passes (no row found yet)...
    mockSelect.mockReturnValue(makeDbChain([]));
    // ...but the UPDATE itself hits the DB's unique constraint because another
    // request grabbed the same username in between.
    mockUpdate.mockReturnValue(
      makeDbChain(Promise.reject(Object.assign(new Error("duplicate key"), { code: "23505" })))
    );
    const res = await PATCH(makePatchReq({ username: "racedname" }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/already taken/i);
  });

  it("returns 500 on an unrelated db error during update", async () => {
    authedAs(makeUser({ id: 1 }));
    mockSelect.mockReturnValue(makeDbChain([]));
    mockUpdate.mockReturnValue(makeDbChain(Promise.reject(new Error("connection lost"))));
    const res = await PATCH(makePatchReq({ username: "anyname" }));
    expect(res.status).toBe(500);
  });
});
