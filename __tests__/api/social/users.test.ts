import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { User } from "@/lib/db/schema";

vi.mock("@/lib/social-auth", () => ({ requireUser: vi.fn() }));

function makeDbChain(resolveWith: unknown = []) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = new Proxy(function () { return chain; }, {
    get(_t, prop) {
      if (prop === "then") return (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve(resolveWith).then(res, rej);
      if (prop === "catch") return (rej: (e: unknown) => unknown) => Promise.resolve(resolveWith).catch(rej);
      return () => chain;
    },
    apply() { return chain; },
  });
  return chain;
}

const { mockSelect } = vi.hoisted(() => ({ mockSelect: vi.fn(() => makeDbChain([])) }));
vi.mock("@/lib/db", () => ({ db: { select: mockSelect } }));

import { GET } from "@/app/api/social/users/route";
import { requireUser } from "@/lib/social-auth";

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 1, qfId: "qf-1", username: "me", displayName: null,
    createdAt: new Date(), lastActiveAt: new Date(),
    currentStreak: 0, longestStreak: 0, lastActivityDate: null, disabledAt: null, ...overrides,
  };
}

function req(q?: string) {
  const url = q === undefined ? "http://localhost/api/social/users" : `http://localhost/api/social/users?q=${q}`;
  return new NextRequest(url, { headers: { Authorization: "Bearer valid-token" } });
}

describe("GET /api/social/users", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockReset();
    mockSelect.mockReturnValue(makeDbChain([]));
  });

  it("returns 401 when unauthorized", async () => {
    vi.mocked(requireUser).mockResolvedValue(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    expect((await GET(req("ali"))).status).toBe(401);
  });

  it("returns [] for an empty query", async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 1, user: makeUser() });
    const body = await (await GET(req())).json();
    expect(body).toEqual([]);
  });

  it("derives the relationship status for each match", async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 1, user: makeUser() });
    mockSelect
      // matches
      .mockReturnValueOnce(makeDbChain([
        { id: 2, username: "alice", displayName: null },
        { id: 3, username: "alvin", displayName: null },
        { id: 4, username: "alma", displayName: null },
      ]))
      // relationships involving me (1)
      .mockReturnValueOnce(makeDbChain([
        { requesterId: 1, addresseeId: 2, status: "accepted" },
        { requesterId: 1, addresseeId: 3, status: "pending" },
        { requesterId: 4, addresseeId: 1, status: "pending" },
      ]));
    const body = await (await GET(req("al"))).json();
    expect(body.find((u: { id: number }) => u.id === 2).status).toBe("accepted");
    expect(body.find((u: { id: number }) => u.id === 3).status).toBe("pending_sent");
    expect(body.find((u: { id: number }) => u.id === 4).status).toBe("pending_received");
  });
});
