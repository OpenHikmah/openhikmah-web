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
        if (prop === "catch") return (fn: (e: unknown) => unknown) =>
          Promise.resolve(resolveWith).catch(fn);
        if (prop === Symbol.toStringTag) return "MockChain";
        return () => chain;
      },
      apply() { return chain; },
    }
  );
  return chain;
}

// Records the args of each chained call so a test can assert the GET query is
// bounded (orderBy + limit) rather than fetching every row for the user.
function makeRecordingChain(resolveWith: unknown, calls: Record<string, unknown[][]>) {
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
        return (...args: unknown[]) => {
          (calls[prop as string] ??= []).push(args);
          return chain;
        };
      },
      apply() { return chain; },
    }
  );
  return chain;
}

const { mockSelect, mockInsert, mockUpdate, mockDelete, mockConsume } = vi.hoisted(() => ({
  mockSelect: vi.fn(() => makeDbChain([])),
  mockInsert: vi.fn(() => makeDbChain([])),
  mockUpdate: vi.fn(() => makeDbChain([])),
  mockDelete: vi.fn(() => makeDbChain([])),
  mockConsume: vi.fn(async () => true),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
  },
}));
vi.mock("@/lib/rate-limit", () => ({
  consume: mockConsume,
  MUTATION_LIMIT: 60,
  MUTATION_WINDOW_SECONDS: 600,
}));

import { GET, POST } from "@/app/api/social/challenges/route";
import { PATCH } from "@/app/api/social/challenges/[id]/route";
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

function makeChallenge(overrides = {}) {
  return {
    id: 1,
    challengerId: 1,
    challengedId: 2,
    verseRef: null,
    activityType: "connection_made",
    status: "pending",
    startsAt: new Date(),
    endsAt: new Date(Date.now() + 86_400_000),
    winnerId: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function makePostReq(body: object) {
  return new NextRequest("http://localhost/api/social/challenges", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer token" },
    body: JSON.stringify(body),
  });
}

function makeGetReq() {
  return new NextRequest("http://localhost/api/social/challenges", {
    headers: { Authorization: "Bearer token" },
  });
}

function makePatchReq(id: string, body: object) {
  return new NextRequest(`http://localhost/api/social/challenges/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: "Bearer token" },
    body: JSON.stringify(body),
  });
}

// ── POST /api/social/challenges ────────────────────────────────────────────────

describe("POST /api/social/challenges", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockReset();
    mockSelect.mockReturnValue(makeDbChain([]));
    mockInsert.mockReturnValue(makeDbChain([makeChallenge()]));
    mockDelete.mockReturnValue(makeDbChain([]));
    mockConsume.mockReset();
    mockConsume.mockResolvedValue(true);
  });

  it("returns 401 when unauthorized", async () => {
    vi.mocked(requireUser).mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    );
    const res = await POST(makePostReq({ challengedUsername: "bob", duration: "24h" }));
    expect(res.status).toBe(401);
  });

  it("returns 429 when the per-user challenge rate limit is exceeded", async () => {
    authedAs(makeUser());
    mockConsume.mockResolvedValue(false);
    const res = await POST(makePostReq({ challengedUsername: "bob", duration: "24h" }));
    expect(res.status).toBe(429);
  });

  it("returns 400 when challengedUsername is missing", async () => {
    authedAs(makeUser());
    const res = await POST(makePostReq({ duration: "24h" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/challengedUsername/i);
  });

  it("returns 400 when duration is invalid", async () => {
    authedAs(makeUser());
    const res = await POST(makePostReq({ challengedUsername: "bob", duration: "3d" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/duration/i);
  });

  it("returns 404 when target user not found", async () => {
    authedAs(makeUser({ id: 1 }));
    mockSelect.mockReturnValue(makeDbChain([]));
    const res = await POST(makePostReq({ challengedUsername: "ghost", duration: "24h" }));
    expect(res.status).toBe(404);
  });

  it("returns 400 when challenging yourself", async () => {
    authedAs(makeUser({ id: 1 }));
    mockSelect.mockReturnValue(makeDbChain([{ id: 1, username: "testuser" }]));
    const res = await POST(makePostReq({ challengedUsername: "testuser", duration: "24h" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/yourself/i);
  });

  it("returns 409 when not friends", async () => {
    authedAs(makeUser({ id: 1 }));
    mockSelect
      .mockReturnValueOnce(makeDbChain([{ id: 2, username: "bob" }]))
      .mockReturnValueOnce(makeDbChain([])); // no accepted friendship
    const res = await POST(makePostReq({ challengedUsername: "bob", duration: "24h" }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/friends/i);
  });

  it("returns 409 when active challenge already exists", async () => {
    authedAs(makeUser({ id: 1 }));
    mockSelect
      .mockReturnValueOnce(makeDbChain([{ id: 2, username: "bob" }]))
      .mockReturnValueOnce(makeDbChain([{ id: 5, status: "accepted" }])) // friendship
      .mockReturnValueOnce(makeDbChain([makeChallenge({ status: "active" })])); // existing
    const res = await POST(makePostReq({ challengedUsername: "bob", duration: "24h" }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/already exists/i);
  });

  it("returns 201 on success", async () => {
    authedAs(makeUser({ id: 1 }));
    mockSelect
      .mockReturnValueOnce(makeDbChain([{ id: 2, username: "bob" }]))
      .mockReturnValueOnce(makeDbChain([{ id: 5, status: "accepted" }]))
      .mockReturnValueOnce(makeDbChain([])); // no existing challenge
    mockInsert.mockReturnValue(makeDbChain([makeChallenge({ status: "pending" })]));
    const res = await POST(makePostReq({ challengedUsername: "bob", duration: "24h" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe("pending");
  });
});

// ── GET /api/social/challenges ─────────────────────────────────────────────────

describe("GET /api/social/challenges", () => {
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

  it("returns empty array when user has no challenges", async () => {
    authedAs(makeUser());
    mockSelect.mockReturnValue(makeDbChain([]));
    const res = await GET(makeGetReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(0);
  });

  it("bounds the challenges query with orderBy + limit(200)", async () => {
    // NOTE: the route issues the unbounded active-resolution select, then the
    // unbounded pending-expiry select, then the capped display select. The
    // recording chain is wired to that third select. If the route is
    // reordered, update which Once() carries the recording chain.
    authedAs(makeUser({ id: 1 }));
    const calls: Record<string, unknown[][]> = {};
    mockSelect
      .mockReturnValueOnce(makeDbChain([]))                // resolution query (no ended-active)
      .mockReturnValueOnce(makeDbChain([]))                // pending-expiry query (none expired)
      .mockReturnValueOnce(makeRecordingChain([], calls)); // capped display query
    const res = await GET(makeGetReq());
    expect(res.status).toBe(200);
    expect(calls.orderBy?.[0]).toHaveLength(1); // ordered (by desc(createdAt)), not just capped
    expect(calls.limit?.[0]).toEqual([200]);
  });

  it("returns 500 when the challenges query throws", async () => {
    authedAs(makeUser({ id: 1 }));
    mockSelect.mockReturnValue(makeDbChain(Promise.reject(new Error("boom"))));
    const res = await GET(makeGetReq());
    expect(res.status).toBe(500);
  });

  it("returns enriched challenges with usernames and scores", async () => {
    authedAs(makeUser({ id: 1 }));
    const challenge = makeChallenge({ status: "pending" });
    mockSelect
      .mockReturnValueOnce(makeDbChain([]))                     // resolution query (none ended-active)
      .mockReturnValueOnce(makeDbChain([]))                     // pending-expiry query (none expired)
      .mockReturnValueOnce(makeDbChain([challenge]))            // capped display query
      .mockReturnValueOnce(makeDbChain([                        // users query
        { id: 1, username: "alice" },
        { id: 2, username: "bob" },
      ]))
      .mockReturnValue(makeDbChain([{ score: 0 }]));            // score queries
    const res = await GET(makeGetReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].challengerUsername).toBe("alice");
    expect(body[0].challengedUsername).toBe("bob");
  });

  it("resolves expired active challenge lazily", async () => {
    authedAs(makeUser({ id: 1 }));
    const expired = makeChallenge({
      status: "active",
      endsAt: new Date(Date.now() - 1000), // already ended
    });
    mockSelect
      .mockReturnValueOnce(makeDbChain([expired]))             // resolution query (the ended-active row)
      .mockReturnValueOnce(makeDbChain([{ score: 3 }]))        // challengerScore (resolution)
      .mockReturnValueOnce(makeDbChain([{ score: 1 }]))        // challengedScore (resolution)
      .mockReturnValueOnce(makeDbChain([]))                     // pending-expiry query (none expired)
      .mockReturnValueOnce(makeDbChain([                        // capped display query — re-reads the
        makeChallenge({ status: "completed", winnerId: 1 }),    // now-finalized row
      ]))
      .mockReturnValueOnce(makeDbChain([                        // users
        { id: 1, username: "alice" },
        { id: 2, username: "bob" },
      ]));
    // No further score queries expected — cached scores are reused in enrichment.
    // The guarded update must return the row (simulating no concurrent writer)
    // for resolveEndedChallenges to populate its resolved-scores cache.
    mockUpdate.mockReturnValue(makeDbChain([{ id: expired.id }]));
    const res = await GET(makeGetReq());
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalled();
    const body = await res.json();
    expect(body[0].status).toBe("completed");
    expect(body[0].winnerId).toBe(1); // challenger (score 3) beats challenged (score 1)
    expect(body[0].challengerScore).toBe(3);
    expect(body[0].challengedScore).toBe(1);
  });

  it("scores are fetched for active (non-expired) challenges", async () => {
    authedAs(makeUser({ id: 1 }));
    const active = makeChallenge({
      status: "active",
      endsAt: new Date(Date.now() + 3_600_000), // 1 hour from now
    });
    mockSelect
      .mockReturnValueOnce(makeDbChain([]))                     // resolution query (not ended → none)
      .mockReturnValueOnce(makeDbChain([]))                     // pending-expiry query (none expired)
      .mockReturnValueOnce(makeDbChain([active]))               // capped display query
      .mockReturnValueOnce(makeDbChain([                        // users
        { id: 1, username: "alice" },
        { id: 2, username: "bob" },
      ]))
      .mockReturnValueOnce(makeDbChain([{ score: 2 }]))         // challengerScore (enrichment)
      .mockReturnValueOnce(makeDbChain([{ score: 5 }]));        // challengedScore (enrichment)
    const res = await GET(makeGetReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body[0].status).toBe("active");
    expect(body[0].challengerScore).toBe(2);
    expect(body[0].challengedScore).toBe(5);
  });

  it("scores are not fetched for pending challenges", async () => {
    authedAs(makeUser({ id: 1 }));
    const pending = makeChallenge({ status: "pending" });
    mockSelect
      .mockReturnValueOnce(makeDbChain([]))                     // resolution query (none ended-active)
      .mockReturnValueOnce(makeDbChain([]))                     // pending-expiry query (none expired)
      .mockReturnValueOnce(makeDbChain([pending]))              // capped display query
      .mockReturnValueOnce(makeDbChain([                        // users
        { id: 1, username: "alice" },
        { id: 2, username: "bob" },
      ]));
    // No additional mockReturnValueOnce — if scores were fetched this would fail
    const res = await GET(makeGetReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body[0].challengerScore).toBe(0);
    expect(body[0].challengedScore).toBe(0);
  });
});

// ── PATCH /api/social/challenges/[id] ─────────────────────────────────────────

describe("PATCH /api/social/challenges/[id]", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockReset();
    mockSelect.mockReturnValue(makeDbChain([]));
    mockUpdate.mockReturnValue(makeDbChain([makeChallenge({ status: "active" })]));
  });

  it("returns 401 when unauthorized", async () => {
    vi.mocked(requireUser).mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    );
    const res = await PATCH(makePatchReq("1", { action: "accept" }), { params: Promise.resolve({ id: "1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 for non-numeric id", async () => {
    authedAs(makeUser());
    const res = await PATCH(makePatchReq("abc", { action: "accept" }), { params: Promise.resolve({ id: "abc" }) });
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid action", async () => {
    authedAs(makeUser({ id: 2 }));
    mockSelect.mockReturnValue(makeDbChain([makeChallenge()]));
    const res = await PATCH(makePatchReq("1", { action: "skip" }), { params: Promise.resolve({ id: "1" }) });
    expect(res.status).toBe(400);
  });

  it("returns 404 when challenge does not exist", async () => {
    authedAs(makeUser({ id: 2 }));
    mockSelect.mockReturnValue(makeDbChain([]));
    const res = await PATCH(makePatchReq("99", { action: "accept" }), { params: Promise.resolve({ id: "99" }) });
    expect(res.status).toBe(404);
  });

  it("returns 404 when user is not the challenged party", async () => {
    authedAs(makeUser({ id: 99 })); // not challengedId=2
    mockSelect.mockReturnValue(makeDbChain([makeChallenge()]));
    const res = await PATCH(makePatchReq("1", { action: "accept" }), { params: Promise.resolve({ id: "1" }) });
    expect(res.status).toBe(404);
  });

  it("returns 409 when challenge is no longer pending", async () => {
    authedAs(makeUser({ id: 2 }));
    mockSelect.mockReturnValue(makeDbChain([makeChallenge({ status: "active" })]));
    const res = await PATCH(makePatchReq("1", { action: "accept" }), { params: Promise.resolve({ id: "1" }) });
    expect(res.status).toBe(409);
  });

  it("returns 200 and updates to active on accept", async () => {
    authedAs(makeUser({ id: 2 }));
    mockSelect.mockReturnValue(makeDbChain([makeChallenge({ status: "pending" })]));
    mockUpdate.mockReturnValue(makeDbChain([makeChallenge({ status: "active" })]));
    const res = await PATCH(makePatchReq("1", { action: "accept" }), { params: Promise.resolve({ id: "1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("active");
  });

  it("returns 200 and updates to declined on decline", async () => {
    authedAs(makeUser({ id: 2 }));
    mockSelect.mockReturnValue(makeDbChain([makeChallenge({ status: "pending" })]));
    mockUpdate.mockReturnValue(makeDbChain([makeChallenge({ status: "declined" })]));
    const res = await PATCH(makePatchReq("1", { action: "decline" }), { params: Promise.resolve({ id: "1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("declined");
  });

  it("returns 200 and cancels a pending challenge as the challenger", async () => {
    authedAs(makeUser({ id: 1 })); // challengerId
    mockSelect.mockReturnValue(makeDbChain([makeChallenge({ status: "pending" })]));
    mockUpdate.mockReturnValue(makeDbChain([makeChallenge({ status: "cancelled" })]));
    const res = await PATCH(makePatchReq("1", { action: "cancel" }), { params: Promise.resolve({ id: "1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("cancelled");
  });

  it("returns 404 when a non-challenger tries to cancel", async () => {
    authedAs(makeUser({ id: 2 })); // the challenged party cannot cancel
    mockSelect.mockReturnValue(makeDbChain([makeChallenge({ status: "pending" })]));
    const res = await PATCH(makePatchReq("1", { action: "cancel" }), { params: Promise.resolve({ id: "1" }) });
    expect(res.status).toBe(404);
  });
});
