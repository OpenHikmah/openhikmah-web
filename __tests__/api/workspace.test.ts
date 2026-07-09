import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { User } from "@/lib/infra/db/schema";

// ── Mocks ──────────────────────────────────────────────────────────────────────

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
        if (prop === "catch")
          return (rej: (e: unknown) => unknown) => Promise.resolve(resolveWith).catch(rej);
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

// Records chained-call args so a test can assert the list query is bounded.
function makeRecordingChain(resolveWith: unknown, calls: Record<string, unknown[][]>) {
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
        if (prop === "catch")
          return (rej: (e: unknown) => unknown) => Promise.resolve(resolveWith).catch(rej);
        if (prop === Symbol.toStringTag) return "MockChain";
        return (...args: unknown[]) => {
          (calls[prop as string] ??= []).push(args);
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

const { mockSelect, mockInsert, mockDelete, mockRateLimitOrNull } = vi.hoisted(() => ({
  mockSelect: vi.fn(() => makeDbChain([])),
  mockInsert: vi.fn(() => makeDbChain([])),
  mockDelete: vi.fn(() => makeDbChain([])),
  mockRateLimitOrNull: vi.fn(async (): Promise<NextResponse | null> => null),
}));

vi.mock("@/lib/infra/db", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
    delete: mockDelete,
  },
}));
vi.mock("@/lib/infra/rate-limit", () => ({
  rateLimitOrNull: mockRateLimitOrNull,
}));

import { GET, POST } from "@/app/api/workspace/route";
import { GET as GET_ID, DELETE } from "@/app/api/workspace/[id]/route";
import { requireUser } from "@/lib/auth/social-auth";

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

function authed(user = makeUser()) {
  vi.mocked(requireUser).mockResolvedValue({ userId: user.id, user });
}

function unauthed() {
  vi.mocked(requireUser).mockResolvedValue(
    NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  );
}

function req(method = "GET", body?: object) {
  return new NextRequest("http://localhost/api/workspace", {
    method,
    headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// ── GET /api/workspace (list) ───────────────────────────────────────────────────

describe("GET /api/workspace", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockReset();
    mockSelect.mockReset();
    mockSelect.mockReturnValue(makeDbChain([]));
  });

  it("returns 401 when not authenticated", async () => {
    unauthed();
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it("returns the user's workspaces", async () => {
    authed();
    mockSelect.mockReturnValue(
      makeDbChain([
        { id: 2, name: "B" },
        { id: 1, name: "A" },
      ])
    );
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0].name).toBe("B");
  });

  it("bounds the list query with orderBy + limit(500)", async () => {
    authed();
    const calls: Record<string, unknown[][]> = {};
    mockSelect.mockReturnValue(makeRecordingChain([], calls));
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(calls.orderBy?.[0]).toHaveLength(1); // ordered (by desc(updatedAt)), not just capped
    expect(calls.limit?.[0]).toEqual([500]);
  });

  it("returns 500 on a db error", async () => {
    authed();
    mockSelect.mockReturnValue(makeDbChain(Promise.reject(new Error("boom"))));
    const res = await GET(req());
    expect(res.status).toBe(500);
  });
});

// ── POST /api/workspace ─────────────────────────────────────────────────────────

describe("POST /api/workspace", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockReset();
    mockInsert.mockReset();
    mockInsert.mockReturnValue(
      makeDbChain([{ id: 1, name: "Untitled canvas", createdAt: new Date() }])
    );
    mockRateLimitOrNull.mockReset();
    mockRateLimitOrNull.mockResolvedValue(null);
  });

  it("returns 401 when not authenticated", async () => {
    unauthed();
    const res = await POST(req("POST", { data: { nodes: [] } }));
    expect(res.status).toBe(401);
  });

  it("returns 429 when the per-user canvas-save rate limit is exceeded", async () => {
    authed();
    mockRateLimitOrNull.mockResolvedValue(
      NextResponse.json({ error: "Too many" }, { status: 429 })
    );
    const res = await POST(req("POST", { data: { nodes: [] } }));
    expect(res.status).toBe(429);
  });

  it("returns 400 for malformed JSON body", async () => {
    authed();
    const bad = new NextRequest("http://localhost/api/workspace", {
      method: "POST",
      headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
      body: "not-json",
    });
    const res = await POST(bad);
    expect(res.status).toBe(400);
  });

  it("returns 400 when data is missing", async () => {
    authed();
    const res = await POST(req("POST", { name: "x" }));
    expect(res.status).toBe(400);
  });

  it("returns 413 when the canvas is too large", async () => {
    authed();
    const huge = { blob: "x".repeat(600 * 1024) };
    const res = await POST(req("POST", { data: huge }));
    expect(res.status).toBe(413);
  });

  it("returns 201 and persists on success", async () => {
    authed();
    const res = await POST(req("POST", { name: "My canvas", data: { nodes: [] }, nodeCount: 3 }));
    expect(res.status).toBe(201);
    expect(mockInsert).toHaveBeenCalled();
  });
});

// ── GET /api/workspace/[id] ─────────────────────────────────────────────────────

describe("GET /api/workspace/[id]", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockReset();
    mockSelect.mockReset();
    mockSelect.mockReturnValue(makeDbChain([]));
  });

  function idReq() {
    return new NextRequest("http://localhost/api/workspace/1", {
      headers: { Authorization: "Bearer token" },
    });
  }

  it("returns 401 when not authenticated", async () => {
    unauthed();
    const res = await GET_ID(idReq(), { params: Promise.resolve({ id: "1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 400 for a non-numeric id", async () => {
    authed();
    const res = await GET_ID(idReq(), { params: Promise.resolve({ id: "abc" }) });
    expect(res.status).toBe(400);
  });

  it("returns 404 when the workspace is not owned/found", async () => {
    authed();
    mockSelect.mockReturnValue(makeDbChain([]));
    const res = await GET_ID(idReq(), { params: Promise.resolve({ id: "9" }) });
    expect(res.status).toBe(404);
  });

  it("returns the parsed canvas data on success", async () => {
    authed();
    mockSelect.mockReturnValue(makeDbChain([{ data: JSON.stringify({ nodes: [1, 2] }) }]));
    const res = await GET_ID(idReq(), { params: Promise.resolve({ id: "1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.nodes).toEqual([1, 2]);
  });

  it("returns 500 on corrupted stored data", async () => {
    authed();
    mockSelect.mockReturnValue(makeDbChain([{ data: "not-json" }]));
    const res = await GET_ID(idReq(), { params: Promise.resolve({ id: "1" }) });
    expect(res.status).toBe(500);
  });
});

// ── DELETE /api/workspace/[id] ──────────────────────────────────────────────────

describe("DELETE /api/workspace/[id]", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockReset();
    mockDelete.mockReset();
    mockDelete.mockReturnValue(makeDbChain([]));
  });

  function delReq() {
    return new NextRequest("http://localhost/api/workspace/1", {
      method: "DELETE",
      headers: { Authorization: "Bearer token" },
    });
  }

  it("returns 401 when not authenticated", async () => {
    unauthed();
    const res = await DELETE(delReq(), { params: Promise.resolve({ id: "1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 400 for a non-numeric id", async () => {
    authed();
    const res = await DELETE(delReq(), { params: Promise.resolve({ id: "abc" }) });
    expect(res.status).toBe(400);
  });

  it("returns 404 when nothing was deleted (not owned)", async () => {
    authed();
    mockDelete.mockReturnValue(makeDbChain([]));
    const res = await DELETE(delReq(), { params: Promise.resolve({ id: "9" }) });
    expect(res.status).toBe(404);
  });

  it("returns 204 on successful delete", async () => {
    authed();
    mockDelete.mockReturnValue(makeDbChain([{ id: 1 }]));
    const res = await DELETE(delReq(), { params: Promise.resolve({ id: "1" }) });
    expect(res.status).toBe(204);
  });
});
