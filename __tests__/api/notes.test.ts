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

const { mockSelect, mockInsert, mockRateLimitOrNull } = vi.hoisted(() => ({
  mockSelect: vi.fn(() => makeDbChain([])),
  mockInsert: vi.fn(() => makeDbChain([])),
  mockRateLimitOrNull: vi.fn(async (): Promise<NextResponse | null> => null),
}));

vi.mock("@/lib/infra/db", () => ({ db: { select: mockSelect, insert: mockInsert } }));
vi.mock("@/lib/infra/rate-limit", () => ({
  rateLimitOrNull: mockRateLimitOrNull,
}));

import { GET, POST } from "@/app/api/notes/route";
import { requireUser } from "@/lib/auth/social-auth";

function makeUser(): User {
  return {
    id: 1,
    qfId: "qf-1",
    username: "u",
    displayName: null,
    createdAt: new Date(),
    lastActiveAt: new Date(),
    currentStreak: 0,
    longestStreak: 0,
    lastActivityDate: null,
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
function req(method: string, body?: object, url = "http://localhost/api/notes") {
  return new NextRequest(url, {
    method,
    headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("GET /api/notes", () => {
  beforeEach(() => {
    mockSelect.mockReset();
    mockSelect.mockReturnValue(makeDbChain([]));
  });

  it("401 when unauthenticated", async () => {
    unauthed();
    expect((await GET(req("GET", undefined, "http://localhost/api/notes?ref=2:255"))).status).toBe(
      401
    );
  });

  it("400 when ref is missing", async () => {
    authed();
    expect((await GET(req("GET"))).status).toBe(400);
  });

  it("400 when ref format is invalid", async () => {
    authed();
    expect((await GET(req("GET", undefined, "http://localhost/api/notes?ref=nope"))).status).toBe(
      400
    );
  });

  it("returns notes for a valid ref", async () => {
    authed();
    mockSelect.mockReturnValue(makeDbChain([{ id: 1, verseRef: "2:255", note: "hi" }]));
    const res = await GET(req("GET", undefined, "http://localhost/api/notes?ref=2:255"));
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveLength(1);
  });
});

describe("POST /api/notes", () => {
  beforeEach(() => {
    mockInsert.mockReset();
    mockInsert.mockReturnValue(makeDbChain([{ id: 1, verseRef: "2:255", note: "hi" }]));
    mockRateLimitOrNull.mockReset();
    mockRateLimitOrNull.mockResolvedValue(null);
  });

  it("401 when unauthenticated", async () => {
    unauthed();
    expect((await POST(req("POST", { ref: "2:255", note: "x" }))).status).toBe(401);
  });

  it("429 when the per-user notes rate limit is exceeded", async () => {
    authed();
    mockRateLimitOrNull.mockResolvedValue(
      NextResponse.json({ error: "Too many" }, { status: 429 })
    );
    expect((await POST(req("POST", { ref: "2:255", note: "x" }))).status).toBe(429);
  });

  it("400 for malformed JSON body", async () => {
    authed();
    const bad = new NextRequest("http://localhost/api/notes", {
      method: "POST",
      headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
      body: "not-json",
    });
    expect((await POST(bad)).status).toBe(400);
  });

  it("400 for invalid verse ref", async () => {
    authed();
    expect((await POST(req("POST", { ref: "nope", note: "x" }))).status).toBe(400);
  });

  it("400 when note is missing", async () => {
    authed();
    expect((await POST(req("POST", { ref: "2:255" }))).status).toBe(400);
  });

  it("400 when note exceeds the max length", async () => {
    authed();
    const res = await POST(req("POST", { ref: "2:255", note: "x".repeat(10_001) }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/too long/i);
  });

  it("201 when note is exactly at the max length", async () => {
    authed();
    const res = await POST(req("POST", { ref: "2:255", note: "x".repeat(10_000) }));
    expect(res.status).toBe(201);
  });

  it("201 when note is created", async () => {
    authed();
    const res = await POST(req("POST", { ref: "2:255", note: "reflection" }));
    expect(res.status).toBe(201);
    expect(mockInsert).toHaveBeenCalled();
  });
});
