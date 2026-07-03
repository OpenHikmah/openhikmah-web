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

const { mockSelect, mockInsert, mockUpdate, mockRateLimitOrNull } = vi.hoisted(() => ({
  mockSelect: vi.fn(() => makeDbChain([])),
  mockInsert: vi.fn(() => makeDbChain([])),
  mockUpdate: vi.fn(() => makeDbChain([])),
  mockRateLimitOrNull: vi.fn(async (): Promise<NextResponse | null> => null),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
  },
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimitOrNull: mockRateLimitOrNull,
}));

import { GET, POST } from "@/app/api/social/friends/route";
import { requireUser } from "@/lib/social-auth";

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    qfId: "qf-1",
    username: "testuser",
    displayName: null,
    createdAt: new Date(),
    lastActiveAt: new Date(),
    currentStreak: 0,
    longestStreak: 0,
    lastActivityDate: null,
    disabledAt: null,
    ...overrides,
  };
}

function authedAs(user: User) {
  vi.mocked(requireUser).mockResolvedValue({ userId: user.id, user });
}

function makeGetReq() {
  return new NextRequest("http://localhost/api/social/friends", {
    headers: { Authorization: "Bearer valid-token" },
  });
}

function makePostReq(body: object) {
  return new NextRequest("http://localhost/api/social/friends", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer valid-token",
    },
    body: JSON.stringify(body),
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("GET /api/social/friends", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockReset();
    mockSelect.mockReturnValue(makeDbChain([]));
  });

  it("returns 401 when unauthorized", async () => {
    vi.mocked(requireUser).mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    );
    const res = await GET(makeGetReq());
    expect(res.status).toBe(401);
  });

  it("returns empty array when user has no friends", async () => {
    authedAs(makeUser());
    mockSelect.mockReturnValue(makeDbChain([]));
    const res = await GET(makeGetReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(0);
  });
});

describe("POST /api/social/friends", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockReset();
    mockSelect.mockReturnValue(makeDbChain([]));
    mockInsert.mockReturnValue(
      makeDbChain([{ id: 10, status: "pending", requesterId: 1, addresseeId: 2 }])
    );
    mockUpdate.mockReturnValue(makeDbChain([]));
    mockRateLimitOrNull.mockReset();
    mockRateLimitOrNull.mockResolvedValue(null);
  });

  it("returns 401 when unauthorized", async () => {
    vi.mocked(requireUser).mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    );
    const res = await POST(makePostReq({ username: "friend99" }));
    expect(res.status).toBe(401);
  });

  it("returns 429 when the per-user friend-request rate limit is exceeded", async () => {
    authedAs(makeUser());
    mockRateLimitOrNull.mockResolvedValue(NextResponse.json({ error: "Too many" }, { status: 429 }));
    const res = await POST(makePostReq({ username: "friend99" }));
    expect(res.status).toBe(429);
  });

  it("returns 400 when username is missing", async () => {
    authedAs(makeUser());
    const res = await POST(makePostReq({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/missing username/i);
  });

  it("returns 400 for malformed JSON", async () => {
    authedAs(makeUser());
    const req = new NextRequest("http://localhost/api/social/friends", {
      method: "POST",
      headers: { Authorization: "Bearer valid-token" },
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 404 when target user does not exist", async () => {
    authedAs(makeUser({ id: 1 }));
    mockSelect.mockReturnValue(makeDbChain([]));
    const res = await POST(makePostReq({ username: "ghost_user" }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/not found/i);
  });

  it("returns 400 when trying to add yourself", async () => {
    authedAs(makeUser({ id: 5 }));
    mockSelect.mockReturnValue(makeDbChain([{ id: 5, username: "testuser" }]));
    const res = await POST(makePostReq({ username: "testuser" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/cannot add yourself/i);
  });

  it("returns 409 when friendship already exists (accepted)", async () => {
    authedAs(makeUser({ id: 1 }));
    mockSelect
      .mockReturnValueOnce(makeDbChain([{ id: 2, username: "friend99" }]))
      .mockReturnValueOnce(makeDbChain([{ id: 10, status: "accepted" }]));
    const res = await POST(makePostReq({ username: "friend99" }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/already friends/i);
  });

  it("returns 409 when an outgoing request is already pending", async () => {
    authedAs(makeUser({ id: 1 }));
    mockSelect
      .mockReturnValueOnce(makeDbChain([{ id: 2, username: "friend99" }]))
      // requesterId is me (1) → outgoing pending
      .mockReturnValueOnce(makeDbChain([{ id: 10, status: "pending", requesterId: 1 }]));
    const res = await POST(makePostReq({ username: "friend99" }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/request already sent/i);
  });

  it("auto-accepts when the target already sent you a pending request", async () => {
    authedAs(makeUser({ id: 1 }));
    mockSelect
      .mockReturnValueOnce(makeDbChain([{ id: 2, username: "friend99" }]))
      // requesterId is the target (2) → incoming pending, should be accepted
      .mockReturnValueOnce(makeDbChain([{ id: 10, status: "pending", requesterId: 2 }]));
    mockUpdate.mockReturnValueOnce(makeDbChain([{ id: 10, status: "accepted" }]));
    const res = await POST(makePostReq({ username: "friend99" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("accepted");
    expect(body.mutual).toBe(true);
  });

  it("returns 409 (not 500) when a concurrent insert hits the unique constraint", async () => {
    authedAs(makeUser({ id: 1 }));
    mockSelect
      .mockReturnValueOnce(makeDbChain([{ id: 2, username: "friend99" }]))
      .mockReturnValueOnce(makeDbChain([]));
    mockInsert.mockReturnValueOnce({
      values: () => ({ returning: () => Promise.reject({ code: "23505" }) }),
    } as unknown as ReturnType<typeof mockInsert>);
    const res = await POST(makePostReq({ username: "friend99" }));
    expect(res.status).toBe(409);
  });

  it("returns 201 with friendship data on success", async () => {
    authedAs(makeUser({ id: 1 }));
    mockSelect
      .mockReturnValueOnce(makeDbChain([{ id: 2, username: "friend99" }]))
      .mockReturnValueOnce(makeDbChain([]));
    mockInsert.mockReturnValue(
      makeDbChain([{ id: 10, status: "pending", requesterId: 1, addresseeId: 2 }])
    );
    const res = await POST(makePostReq({ username: "friend99" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe("pending");
    expect(body.friend.username).toBe("friend99");
  });
});
