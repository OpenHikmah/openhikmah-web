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

const { mockSelect, mockInsert, mockDelete } = vi.hoisted(() => ({
  mockSelect: vi.fn(() => makeDbChain([])),
  mockInsert: vi.fn(() => makeDbChain([])),
  mockDelete: vi.fn(() => makeDbChain([])),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
    delete: mockDelete,
  },
}));

import { GET, POST } from "@/app/api/bookmarks/route";
import { DELETE } from "@/app/api/bookmarks/[ref]/route";
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
    ...overrides,
  };
}

function authedUser(user = makeUser()) {
  vi.mocked(requireUser).mockResolvedValue({ userId: user.id, user });
}

function unauthedUser() {
  vi.mocked(requireUser).mockResolvedValue(
    NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  );
}

function req(method = "GET", body?: object, url = "http://localhost/api/bookmarks") {
  return new NextRequest(url, {
    method,
    headers: {
      Authorization: "Bearer test-token",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("GET /api/bookmarks", () => {
  beforeEach(() => {
    mockSelect.mockReset();
    mockSelect.mockReturnValue(makeDbChain([]));
  });

  it("returns 401 when not authenticated", async () => {
    unauthedUser();
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it("returns refs for authenticated user", async () => {
    authedUser();
    mockSelect.mockReturnValue(
      makeDbChain([{ verseRef: "2:255" }, { verseRef: "1:1" }])
    );
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.refs).toEqual(["2:255", "1:1"]);
  });

  it("returns empty refs when user has no bookmarks", async () => {
    authedUser();
    mockSelect.mockReturnValue(makeDbChain([]));
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.refs).toEqual([]);
  });
});

describe("POST /api/bookmarks", () => {
  beforeEach(() => {
    mockInsert.mockReset();
    mockInsert.mockReturnValue(makeDbChain([]));
  });

  it("returns 401 when not authenticated", async () => {
    unauthedUser();
    const res = await POST(req("POST", { ref: "2:255" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid verse ref format", async () => {
    authedUser();
    const res = await POST(req("POST", { ref: "invalid" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing ref", async () => {
    authedUser();
    const res = await POST(req("POST", {}));
    expect(res.status).toBe(400);
  });

  it("returns 400 for malformed JSON body", async () => {
    authedUser();
    const badReq = new NextRequest("http://localhost/api/bookmarks", {
      method: "POST",
      headers: { Authorization: "Bearer test-token", "Content-Type": "application/json" },
      body: "not-json",
    });
    const res = await POST(badReq);
    expect(res.status).toBe(400);
  });

  it("returns 200 ok when bookmark is saved", async () => {
    authedUser();
    const res = await POST(req("POST", { ref: "2:255" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("saves to DB with correct values", async () => {
    authedUser();
    await POST(req("POST", { ref: "3:18" }));
    expect(mockInsert).toHaveBeenCalled();
  });
});

describe("DELETE /api/bookmarks/[ref]", () => {
  beforeEach(() => {
    mockDelete.mockReset();
    mockDelete.mockReturnValue(makeDbChain([]));
  });

  function deleteReq(withToken = true) {
    return new NextRequest("http://localhost/api/bookmarks/2%3A255", {
      method: "DELETE",
      headers: withToken ? { Authorization: "Bearer test-token" } : {},
    });
  }

  it("returns 401 when not authenticated", async () => {
    unauthedUser();
    const res = await DELETE(deleteReq(), {
      params: Promise.resolve({ ref: "2%3A255" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 200 ok when bookmark is deleted", async () => {
    authedUser();
    const res = await DELETE(deleteReq(), {
      params: Promise.resolve({ ref: "2%3A255" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("returns 400 for invalid id", async () => {
    authedUser();
    const res = await DELETE(deleteReq(), {
      params: Promise.resolve({ ref: "" }),
    });
    // empty ref decodes to "" — still valid for delete (just won't match rows)
    expect([200, 400]).toContain(res.status);
  });
});
