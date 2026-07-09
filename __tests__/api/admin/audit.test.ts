import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { User } from "@/lib/infra/db/schema";

vi.mock("@/lib/admin/admin-auth", () => ({ requireAdmin: vi.fn() }));

function makeDbChain(resolveWith: unknown = [], onLimit?: (n: number) => void) {
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
        if (prop === "limit" && onLimit) return (n: number) => (onLimit(n), chain);
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

import { GET } from "@/app/api/admin/audit/route";
import { requireAdmin } from "@/lib/admin/admin-auth";

const admin = { userId: 1, user: { qfId: "qf-admin" } as User };

function req(limit?: string) {
  const url = limit
    ? `http://localhost/api/admin/audit?limit=${limit}`
    : "http://localhost/api/admin/audit";
  return new NextRequest(url, { headers: { Authorization: "Bearer t" } });
}

const row = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 1,
  adminQfId: "qf-admin",
  action: "user.disable",
  targetType: "user",
  targetId: "42",
  meta: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  ...overrides,
});

beforeEach(() => {
  vi.mocked(requireAdmin).mockResolvedValue(admin);
  mockSelect.mockReturnValue(makeDbChain([]));
});

describe("GET /api/admin/audit", () => {
  it("returns the guard's own response for a non-admin caller", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(
      NextResponse.json({ error: "Not found" }, { status: 404 })
    );
    const res = await GET(req());
    expect(res.status).toBe(404);
  });

  it("returns entries with parsed meta", async () => {
    mockSelect.mockReturnValue(
      makeDbChain([row({ meta: JSON.stringify({ from: "active", to: "flagged" }) })])
    );
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0].meta).toEqual({ from: "active", to: "flagged" });
  });

  it("falls back to the raw string when meta isn't valid JSON", async () => {
    mockSelect.mockReturnValue(makeDbChain([row({ meta: "not-json" })]));
    const res = await GET(req());
    const body = await res.json();
    expect(body.entries[0].meta).toBe("not-json");
  });

  it("returns null meta as-is", async () => {
    mockSelect.mockReturnValue(makeDbChain([row({ meta: null })]));
    const res = await GET(req());
    const body = await res.json();
    expect(body.entries[0].meta).toBeNull();
  });

  it("falls back to the default limit of 100 for a non-numeric limit", async () => {
    let capturedLimit: number | undefined;
    mockSelect.mockReturnValue(makeDbChain([], (n) => (capturedLimit = n)));
    await GET(req("abc"));
    expect(capturedLimit).toBe(100);
  });

  it("falls back to the default limit of 100 for a negative limit", async () => {
    let capturedLimit: number | undefined;
    mockSelect.mockReturnValue(makeDbChain([], (n) => (capturedLimit = n)));
    await GET(req("-5"));
    expect(capturedLimit).toBe(100);
  });

  it("caps an oversized limit at 500", async () => {
    let capturedLimit: number | undefined;
    mockSelect.mockReturnValue(makeDbChain([], (n) => (capturedLimit = n)));
    const res = await GET(req("10000"));
    expect(res.status).toBe(200);
    expect(capturedLimit).toBe(500);
  });

  it("honors a valid custom limit within the cap", async () => {
    let capturedLimit: number | undefined;
    mockSelect.mockReturnValue(makeDbChain([], (n) => (capturedLimit = n)));
    await GET(req("25"));
    expect(capturedLimit).toBe(25);
  });
});
