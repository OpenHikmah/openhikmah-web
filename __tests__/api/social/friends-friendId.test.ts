import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { User } from "@/lib/infra/db/schema";

vi.mock("@/lib/auth/social-auth", () => ({
  requireUser: vi.fn(),
}));

// Captures each chained call's method name + arguments (in addition to the
// usual thenable passthrough) so tests can assert on the actual .where()
// predicate the route built — not just on the mocked resolved value, which
// would pass identically even if the route queried by the wrong column.
let whereCalls: unknown[] = [];
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
        return (...args: unknown[]) => {
          if (prop === "where") whereCalls.push(args[0]);
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

// drizzle's eq()/and() build a plain, JSON-serializable SQL-chunk tree (once
// functions are stripped) — stringifying it is a cheap way to assert the
// built predicate actually references the expected column and value,
// without coupling to drizzle's exact internal shape.
function whereJSON(cond: unknown): string {
  // Drizzle column objects hold a circular back-reference to their table
  // (column.table.columns[...] === column) — drop it along with functions.
  return JSON.stringify(cond, (k, v) => (typeof v === "function" || k === "table" ? undefined : v));
}

const { mockSelect, mockUpdate, mockDelete } = vi.hoisted(() => ({
  mockSelect: vi.fn(() => makeDbChain([])),
  mockUpdate: vi.fn(() => makeDbChain([])),
  mockDelete: vi.fn(() => makeDbChain([])),
}));
vi.mock("@/lib/infra/db", () => ({
  db: { select: mockSelect, update: mockUpdate, delete: mockDelete },
}));

import { PATCH, DELETE } from "@/app/api/social/friends/[friendId]/route";
import { requireUser } from "@/lib/auth/social-auth";

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

function patchReq(body: object) {
  return new NextRequest("http://localhost/api/social/friends/1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: "Bearer t" },
    body: JSON.stringify(body),
  });
}

function deleteReq() {
  return new NextRequest("http://localhost/api/social/friends/1", {
    method: "DELETE",
    headers: { Authorization: "Bearer t" },
  });
}

function params(friendId = "1") {
  return { params: Promise.resolve({ friendId }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  whereCalls = [];
});

describe("PATCH /api/social/friends/[friendId]", () => {
  it("401s when unauthenticated", async () => {
    vi.mocked(requireUser).mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    );
    const res = await PATCH(patchReq({ action: "accept" }), params());
    expect(res.status).toBe(401);
  });

  it("400s on a non-numeric friendId", async () => {
    authedAs(makeUser());
    const res = await PATCH(patchReq({ action: "accept" }), params("not-a-number"));
    expect(res.status).toBe(400);
  });

  it("400s when action isn't 'accept' or 'decline'", async () => {
    authedAs(makeUser());
    const res = await PATCH(patchReq({ action: "delete-please" }), params());
    expect(res.status).toBe(400);
  });

  it("the addressee can accept a pending request", async () => {
    const addressee = makeUser({ id: 2 });
    authedAs(addressee);
    mockSelect.mockReturnValue(
      makeDbChain([{ id: 1, requesterId: 1, addresseeId: 2, status: "pending" }])
    );
    mockUpdate.mockReturnValue(makeDbChain([{ id: 1, status: "accepted" }]));

    const res = await PATCH(patchReq({ action: "accept" }), params());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ id: 1, status: "accepted" });
    expect(mockUpdate).toHaveBeenCalled();
    // The lookup must be scoped by addresseeId (not e.g. requesterId) — this
    // inspects the actual predicate the route built, not just the mocked
    // return value, so a route bug that queried the wrong column would fail
    // this assertion regardless of what mockSelect is told to resolve with.
    expect(whereJSON(whereCalls[0])).toContain('"addressee_id"');
    expect(whereJSON(whereCalls[0])).toContain("2");
  });

  it("the addressee can decline a pending request, deleting the row rather than soft-marking it", async () => {
    const addressee = makeUser({ id: 2 });
    authedAs(addressee);
    mockSelect.mockReturnValue(
      makeDbChain([{ id: 1, requesterId: 1, addresseeId: 2, status: "pending" }])
    );

    const res = await PATCH(patchReq({ action: "decline" }), params());

    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("declined");
    expect(mockDelete).toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects the requester (or any non-addressee) trying to accept/decline their own outgoing request", async () => {
    // A real DB would return no row here because the requester's id doesn't
    // match the addresseeId filter — simulate that via an empty mock result,
    // then separately assert (below) that the route actually queried by
    // addresseeId=1 (the requester's own id), proving *why* a real lookup
    // would find nothing: this scopes by addressee, not requester.
    const requester = makeUser({ id: 1 });
    authedAs(requester);
    mockSelect.mockReturnValue(makeDbChain([]));

    const res = await PATCH(patchReq({ action: "accept" }), params());

    expect(res.status).toBe(404);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(whereJSON(whereCalls[0])).toContain('"addressee_id"');
    expect(whereJSON(whereCalls[0])).not.toContain('"requester_id"');
  });

  it("rejects re-resolving a request that's already accepted/declined", async () => {
    const addressee = makeUser({ id: 2 });
    authedAs(addressee);
    mockSelect.mockReturnValue(
      makeDbChain([{ id: 1, requesterId: 1, addresseeId: 2, status: "accepted" }])
    );

    const res = await PATCH(patchReq({ action: "decline" }), params());

    expect(res.status).toBe(409);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/social/friends/[friendId]", () => {
  it("401s when unauthenticated", async () => {
    vi.mocked(requireUser).mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    );
    const res = await DELETE(deleteReq(), params());
    expect(res.status).toBe(401);
  });

  it("400s on a non-numeric friendId", async () => {
    authedAs(makeUser());
    const res = await DELETE(deleteReq(), params("not-a-number"));
    expect(res.status).toBe(400);
  });

  it("the requester can remove the friendship", async () => {
    const requester = makeUser({ id: 1 });
    authedAs(requester);
    mockSelect.mockReturnValue(makeDbChain([{ id: 1 }]));

    const res = await DELETE(deleteReq(), params());

    expect(res.status).toBe(200);
    expect(mockDelete).toHaveBeenCalled();
    // Lookup must be OR'd across both requesterId and addresseeId — this
    // inspects the actual predicate built, not just the mocked return value.
    expect(whereJSON(whereCalls[0])).toContain('"requester_id"');
    expect(whereJSON(whereCalls[0])).toContain('"addressee_id"');
  });

  it("the addressee can also remove the friendship", async () => {
    const addressee = makeUser({ id: 2 });
    authedAs(addressee);
    mockSelect.mockReturnValue(makeDbChain([{ id: 1 }]));

    const res = await DELETE(deleteReq(), params());

    expect(res.status).toBe(200);
    expect(mockDelete).toHaveBeenCalled();
    expect(whereJSON(whereCalls[0])).toContain("2");
  });

  it("rejects an unrelated third party trying to remove someone else's friendship", async () => {
    // A real DB would return no row here because this user's id matches
    // neither requesterId nor addresseeId — simulate that via an empty mock
    // result, then separately assert the route actually queried by both
    // columns OR'd together, scoped to this user's id (99).
    const outsider = makeUser({ id: 99 });
    authedAs(outsider);
    mockSelect.mockReturnValue(makeDbChain([]));

    const res = await DELETE(deleteReq(), params());

    expect(res.status).toBe(404);
    expect(mockDelete).not.toHaveBeenCalled();
    expect(whereJSON(whereCalls[0])).toContain('"requester_id"');
    expect(whereJSON(whereCalls[0])).toContain('"addressee_id"');
    expect(whereJSON(whereCalls[0])).toContain("99");
  });
});
