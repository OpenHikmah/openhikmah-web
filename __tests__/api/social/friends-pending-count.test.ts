import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { User } from "@/lib/infra/db/schema";

vi.mock("@/lib/auth/social-auth", () => ({
  requireUser: vi.fn(),
}));

function makeDbChain(resolveWith: unknown) {
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
  mockSelect: vi.fn(),
}));
vi.mock("@/lib/infra/db", () => ({
  db: { select: mockSelect },
}));

import { GET } from "@/app/api/social/friends/pending-count/route";
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
    timezoneOffsetMinutes: null,
    disabledAt: null,
    ...overrides,
  };
}

function authedAs(user: User) {
  vi.mocked(requireUser).mockResolvedValue({ userId: user.id, user });
}

function makeReq() {
  return new NextRequest("http://localhost/api/social/friends/pending-count", {
    headers: { Authorization: "Bearer valid-token" },
  });
}

beforeEach(() => {
  vi.mocked(requireUser).mockReset();
  mockSelect.mockReset();
});

describe("GET /api/social/friends/pending-count", () => {
  it("401s when unauthorized", async () => {
    vi.mocked(requireUser).mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    );
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });

  it("returns the raw DB count, not capped at any pagination limit", async () => {
    // This is a direct COUNT query, not a fetch-and-filter over a page of
    // rows — a user with more than one page's worth of pending requests
    // (the old /api/social/friends?limit=200 approach could undercount past
    // 200) must still get an accurate badge count.
    authedAs(makeUser({ id: 1 }));
    mockSelect.mockReturnValue(makeDbChain([{ count: 250 }]));
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(250);
  });

  it("returns 0 when there are no pending requests", async () => {
    authedAs(makeUser({ id: 1 }));
    mockSelect.mockReturnValue(makeDbChain([{ count: 0 }]));
    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.count).toBe(0);
  });
});
