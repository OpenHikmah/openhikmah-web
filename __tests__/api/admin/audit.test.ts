import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { User } from "@/lib/infra/db/schema";

vi.mock("@/lib/admin/admin-auth", () => ({ requireAdmin: vi.fn() }));

function makeDbChain(
  resolveWith: unknown = [],
  onLimit?: (n: number) => void,
  onOffset?: (n: number) => void,
  onOrderBy?: (cols: unknown[]) => void
) {
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
        if (prop === "offset" && onOffset) return (n: number) => (onOffset(n), chain);
        if (prop === "orderBy" && onOrderBy)
          return (...cols: unknown[]) => (onOrderBy(cols), chain);
        return () => chain;
      },
      apply() {
        return chain;
      },
    }
  );
  return chain;
}

/** Drizzle's `desc(column)` produces an SQL fragment whose queryChunks include the
 *  column itself; the column's `name` is the underlying DB column name. */
function orderedColumnNames(cols: unknown[]): string[] {
  return cols.map((col) => {
    const chunks = (col as { queryChunks?: unknown[] }).queryChunks ?? [];
    const columnChunk = chunks.find(
      (c): c is { name: string } => typeof c === "object" && c !== null && "name" in c
    );
    return columnChunk?.name ?? "";
  });
}

const { mockSelect } = vi.hoisted(() => ({
  mockSelect: vi.fn(() => makeDbChain([])),
}));
vi.mock("@/lib/infra/db", () => ({ db: { select: mockSelect } }));

import { GET } from "@/app/api/admin/audit/route";
import { requireAdmin } from "@/lib/admin/admin-auth";

const admin = { userId: 1, user: { qfId: "qf-admin" } as User };

function req(params?: { limit?: string; offset?: string }) {
  const search = new URLSearchParams();
  if (params?.limit !== undefined) search.set("limit", params.limit);
  if (params?.offset !== undefined) search.set("offset", params.offset);
  const qs = search.toString();
  const url = qs ? `http://localhost/api/admin/audit?${qs}` : "http://localhost/api/admin/audit";
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
    await GET(req({ limit: "abc" }));
    // Fetches one extra row (limit + 1) to detect hasMore.
    expect(capturedLimit).toBe(101);
  });

  it("falls back to the default limit of 100 for a negative limit", async () => {
    let capturedLimit: number | undefined;
    mockSelect.mockReturnValue(makeDbChain([], (n) => (capturedLimit = n)));
    await GET(req({ limit: "-5" }));
    expect(capturedLimit).toBe(101);
  });

  it("caps an oversized limit at 500", async () => {
    let capturedLimit: number | undefined;
    mockSelect.mockReturnValue(makeDbChain([], (n) => (capturedLimit = n)));
    const res = await GET(req({ limit: "10000" }));
    expect(res.status).toBe(200);
    expect(capturedLimit).toBe(501);
  });

  it("honors a valid custom limit within the cap", async () => {
    let capturedLimit: number | undefined;
    mockSelect.mockReturnValue(makeDbChain([], (n) => (capturedLimit = n)));
    await GET(req({ limit: "25" }));
    expect(capturedLimit).toBe(26);
  });

  it("defaults offset to 0 when not supplied", async () => {
    let capturedOffset: number | undefined;
    mockSelect.mockReturnValue(makeDbChain([], undefined, (n) => (capturedOffset = n)));
    await GET(req());
    expect(capturedOffset).toBe(0);
  });

  it("falls back to offset 0 for a negative or non-numeric offset", async () => {
    let capturedOffset: number | undefined;
    mockSelect.mockReturnValue(makeDbChain([], undefined, (n) => (capturedOffset = n)));
    await GET(req({ offset: "-5" }));
    expect(capturedOffset).toBe(0);

    mockSelect.mockReturnValue(makeDbChain([], undefined, (n) => (capturedOffset = n)));
    await GET(req({ offset: "abc" }));
    expect(capturedOffset).toBe(0);
  });

  it("honors a valid custom offset", async () => {
    let capturedOffset: number | undefined;
    mockSelect.mockReturnValue(makeDbChain([], undefined, (n) => (capturedOffset = n)));
    await GET(req({ offset: "50" }));
    expect(capturedOffset).toBe(50);
  });

  it("reports hasMore: true when the DB returns more rows than the requested page", async () => {
    mockSelect.mockReturnValue(makeDbChain([row({ id: 1 }), row({ id: 2 })]));
    const res = await GET(req({ limit: "1" }));
    const body = await res.json();
    expect(body.entries).toHaveLength(1);
    expect(body.hasMore).toBe(true);
  });

  it("reports hasMore: false when the DB returns no more than the requested page", async () => {
    mockSelect.mockReturnValue(makeDbChain([row({ id: 1 })]));
    const res = await GET(req({ limit: "1" }));
    const body = await res.json();
    expect(body.entries).toHaveLength(1);
    expect(body.hasMore).toBe(false);
  });

  it("orders by id after createdAt so rows with equal timestamps have a stable, gap-free page order", async () => {
    let capturedOrderBy: unknown[] = [];
    mockSelect.mockReturnValue(
      makeDbChain([], undefined, undefined, (cols) => (capturedOrderBy = cols))
    );
    await GET(req());
    expect(orderedColumnNames(capturedOrderBy)).toEqual(["created_at", "id"]);
  });
});
