import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { User } from "@/lib/infra/db/schema";

vi.mock("@/lib/auth/social-auth", () => ({ requireUser: vi.fn() }));

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

const { mockSelect, mockUpdate } = vi.hoisted(() => ({
  mockSelect: vi.fn(() => makeDbChain([])),
  mockUpdate: vi.fn(() => makeDbChain(undefined)),
}));
vi.mock("@/lib/infra/db", () => ({ db: { select: mockSelect, update: mockUpdate } }));

import { GET, PATCH } from "@/app/api/social/mentions/route";
import { requireUser } from "@/lib/auth/social-auth";

function makeUser(): User {
  return {
    id: 1,
    qfId: "qf-1",
    username: "alice",
    displayName: null,
    createdAt: new Date(),
    lastActiveAt: new Date(),
    currentStreak: 0,
    longestStreak: 0,
    lastActivityDate: null,
    timezoneOffsetMinutes: null,
    disabledAt: null,
  };
}
function authed() {
  vi.mocked(requireUser).mockResolvedValue({ userId: 1, user: makeUser() });
}
function unauthed() {
  vi.mocked(requireUser).mockResolvedValue(
    NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  );
}
function req(method: string, url = "http://localhost/api/social/mentions") {
  return new NextRequest(url, { method, headers: { Authorization: "Bearer t" } });
}

describe("GET /api/social/mentions", () => {
  beforeEach(() => {
    mockSelect.mockReset();
  });

  it("401 when unauthenticated", async () => {
    unauthed();
    expect((await GET(req("GET"))).status).toBe(401);
  });

  it("returns items and unreadCount", async () => {
    authed();
    mockSelect
      .mockReturnValueOnce(
        makeDbChain([
          {
            id: 1,
            noteId: 5,
            verseRef: "2:255",
            read: false,
            createdAt: new Date(),
            mentioningUsername: "bob",
          },
        ])
      )
      .mockReturnValueOnce(makeDbChain([{ count: 1 }]));

    const res = await GET(req("GET"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.unreadCount).toBe(1);
  });
});

describe("PATCH /api/social/mentions", () => {
  beforeEach(() => {
    mockUpdate.mockReset();
    mockUpdate.mockReturnValue(makeDbChain(undefined));
  });

  it("401 when unauthenticated", async () => {
    unauthed();
    expect((await PATCH(req("PATCH"))).status).toBe(401);
  });

  function patchWith(body: unknown) {
    return new NextRequest("http://localhost/api/social/mentions", {
      method: "PATCH",
      headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("marks only the given mentions as read and returns what is still unread", async () => {
    authed();
    mockSelect.mockReturnValue(makeDbChain([{ count: 4 }]));
    const res = await PATCH(patchWith({ ids: [3, 5] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, unreadCount: 4 });
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["no body", undefined],
    ["a missing ids field", {}],
    ["an empty ids array", { ids: [] }],
    ["a non-integer id", { ids: [1, "2"] }],
    ["a non-positive id", { ids: [0] }],
    ["too many ids", { ids: Array.from({ length: 101 }, (_, i) => i + 1) }],
  ])("400 for %s, without touching the database", async (_label, body) => {
    authed();
    const res = await PATCH(body === undefined ? req("PATCH") : patchWith(body));
    expect(res.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
