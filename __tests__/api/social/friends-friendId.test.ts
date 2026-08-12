import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { User } from "@/lib/infra/db/schema";

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
  });

  it("the addressee can decline a pending request", async () => {
    const addressee = makeUser({ id: 2 });
    authedAs(addressee);
    mockSelect.mockReturnValue(
      makeDbChain([{ id: 1, requesterId: 1, addresseeId: 2, status: "pending" }])
    );
    mockUpdate.mockReturnValue(makeDbChain([{ id: 1, status: "declined" }]));

    const res = await PATCH(patchReq({ action: "decline" }), params());

    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("declined");
  });

  it("rejects the requester (or any non-addressee) trying to accept/decline their own outgoing request", async () => {
    // The requester's own id can never match the addresseeId filter the route
    // queries by, so the DB lookup returns no row for them.
    const requester = makeUser({ id: 1 });
    authedAs(requester);
    mockSelect.mockReturnValue(makeDbChain([]));

    const res = await PATCH(patchReq({ action: "accept" }), params());

    expect(res.status).toBe(404);
    expect(mockUpdate).not.toHaveBeenCalled();
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
  });

  it("the addressee can also remove the friendship", async () => {
    const addressee = makeUser({ id: 2 });
    authedAs(addressee);
    mockSelect.mockReturnValue(makeDbChain([{ id: 1 }]));

    const res = await DELETE(deleteReq(), params());

    expect(res.status).toBe(200);
    expect(mockDelete).toHaveBeenCalled();
  });

  it("rejects an unrelated third party trying to remove someone else's friendship", async () => {
    // Neither requesterId nor addresseeId matches this user, so the DB's
    // OR-filtered lookup returns no row for them.
    const outsider = makeUser({ id: 99 });
    authedAs(outsider);
    mockSelect.mockReturnValue(makeDbChain([]));

    const res = await DELETE(deleteReq(), params());

    expect(res.status).toBe(404);
    expect(mockDelete).not.toHaveBeenCalled();
  });
});
