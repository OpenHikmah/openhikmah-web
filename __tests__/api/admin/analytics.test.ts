import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { User } from "@/lib/infra/db/schema";

vi.mock("@/lib/admin/admin-auth", () => ({ requireAdmin: vi.fn() }));

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

function makeDbErrorChain(reason: unknown) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = new Proxy(
    function () {
      return chain;
    },
    {
      get(_t, prop) {
        if (prop === "then")
          return (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
            Promise.reject(reason).then(res, rej);
        return () => chain;
      },
      apply() {
        return chain;
      },
    }
  );
  return chain;
}

const { mockSelect, mockCount } = vi.hoisted(() => ({
  mockSelect: vi.fn(() => makeDbChain([])),
  mockCount: vi.fn(() => Promise.resolve(0)),
}));
vi.mock("@/lib/infra/db", () => ({ db: { select: mockSelect, $count: mockCount } }));

import { GET } from "@/app/api/admin/analytics/route";
import { requireAdmin } from "@/lib/admin/admin-auth";

const admin = { userId: 1, user: { qfId: "qf-admin" } as User };

function req() {
  return new NextRequest("http://localhost/api/admin/analytics", {
    headers: { Authorization: "Bearer t" },
  });
}

// The route calls db.select 4 times, in this literal order:
// topVerses, connectionsByKind, popularSearches, zeroResultSearches
function queueSelects(results: [unknown, unknown, unknown, unknown]) {
  results.forEach((r) => mockSelect.mockImplementationOnce(() => makeDbChain(r)));
}

beforeEach(() => {
  vi.mocked(requireAdmin).mockResolvedValue(admin);
  mockSelect.mockReturnValue(makeDbChain([]));
  mockCount.mockReset();
  mockCount.mockImplementation(() => Promise.resolve(0));
});

describe("GET /api/admin/analytics", () => {
  it("returns the guard's own response for a non-admin caller", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(
      NextResponse.json({ error: "Not found" }, { status: 404 })
    );
    const res = await GET(req());
    expect(res.status).toBe(404);
  });

  it("aggregates verses, connections, DAU, and search stats", async () => {
    queueSelects([
      [{ fromRef: "2:255", count: 12 }],
      [{ kind: "thematic", count: 30 }],
      [{ query: "mercy", count: 8 }],
      [{ query: "xyzzy", count: 2 }],
    ]);
    mockCount.mockImplementationOnce(() => Promise.resolve(42));

    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.topVerses).toEqual([{ fromRef: "2:255", count: 12 }]);
    expect(body.connectionsByKind).toEqual([{ kind: "thematic", count: 30 }]);
    expect(body.dau).toBe(42);
    expect(body.search).toEqual({
      lookbackDays: 30,
      popular: [{ query: "mercy", count: 8 }],
      zeroResult: [{ query: "xyzzy", count: 2 }],
    });
    expect(body.errors).toBeUndefined();
  });

  it("keeps other sections intact when only zeroResultSearches fails", async () => {
    mockSelect
      .mockImplementationOnce(() => makeDbChain([{ fromRef: "2:255", count: 12 }]))
      .mockImplementationOnce(() => makeDbChain([{ kind: "thematic", count: 30 }]))
      .mockImplementationOnce(() => makeDbChain([{ query: "mercy", count: 8 }]))
      .mockImplementationOnce(() => makeDbErrorChain(new Error("boom")));
    mockCount.mockImplementationOnce(() => Promise.resolve(42));

    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.topVerses).toEqual([{ fromRef: "2:255", count: 12 }]);
    expect(body.dau).toBe(42);
    expect(body.search.popular).toEqual([{ query: "mercy", count: 8 }]);
    expect(body.search.zeroResult).toEqual([]);
    expect(body.errors).toEqual({ zeroResultSearches: "Failed to load" });
  });

  it("keeps other sections intact when the DAU count fails", async () => {
    queueSelects([
      [{ fromRef: "2:255", count: 12 }],
      [{ kind: "thematic", count: 30 }],
      [{ query: "mercy", count: 8 }],
      [{ query: "xyzzy", count: 2 }],
    ]);
    mockCount.mockImplementationOnce(() => Promise.reject(new Error("boom")));

    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dau).toBe(0);
    expect(body.topVerses).toEqual([{ fromRef: "2:255", count: 12 }]);
    expect(body.search.zeroResult).toEqual([{ query: "xyzzy", count: 2 }]);
    expect(body.errors).toEqual({ dau: "Failed to load" });
  });
});
