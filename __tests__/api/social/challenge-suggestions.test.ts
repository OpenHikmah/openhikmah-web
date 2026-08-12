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

const { mockSelect } = vi.hoisted(() => ({
  mockSelect: vi.fn(() => makeDbChain([])),
}));
vi.mock("@/lib/infra/db", () => ({ db: { select: mockSelect } }));

import { GET } from "@/app/api/social/challenge-suggestions/route";
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

function req() {
  return new NextRequest("http://localhost/api/social/challenge-suggestions", {
    headers: { Authorization: "Bearer t" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSelect.mockReturnValue(makeDbChain([]));
});

describe("GET /api/social/challenge-suggestions", () => {
  it("401s when unauthenticated", async () => {
    vi.mocked(requireUser).mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    );
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it("returns only the exposed display fields, dropping admin-only ones like createdBy", async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 1, user: makeUser() });
    const row = {
      id: 1,
      title: "Memorize Al-Fatiha",
      description: "Recite it daily for a week.",
      verseRef: "1:1",
      suggestedDuration: 7,
    };
    mockSelect.mockReturnValue(makeDbChain([row]));

    const res = await GET(req());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.suggestions).toEqual([row]);
  });

  it("returns an empty list when there are no active suggestions", async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 1, user: makeUser() });
    mockSelect.mockReturnValue(makeDbChain([]));

    const res = await GET(req());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ suggestions: [] });
  });
});
