import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { User } from "@/lib/db/schema";

vi.mock("@/lib/admin-auth", () => ({ requireAdmin: vi.fn() }));

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

function makeRejectingChain(error: Error) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = new Proxy(
    function () {
      return chain;
    },
    {
      get(_t, prop) {
        if (prop === "then")
          return (_res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
            Promise.reject(error).then(_res, rej);
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
vi.mock("@/lib/db", () => ({ db: { select: mockSelect } }));

import { GET } from "@/app/api/admin/ai/route";
import { requireAdmin } from "@/lib/admin-auth";

const admin = { userId: 1, user: { qfId: "qf-admin" } as User };

function get() {
  return new NextRequest("http://localhost/api/admin/ai", {
    headers: { Authorization: "Bearer t" },
  });
}

// The route fires 5 db.select(...) queries in this literal Promise.all order:
// totals, monthTotals, byModel, byKind, daily.
function queueQueries(results: [unknown, unknown, unknown, unknown, unknown]) {
  results.forEach((r) => mockSelect.mockReturnValueOnce(makeDbChain(r)));
}

beforeEach(() => {
  vi.mocked(requireAdmin).mockResolvedValue(admin);
  mockSelect.mockReset();
  mockSelect.mockReturnValue(makeDbChain([]));
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/admin/ai", () => {
  it("returns the guard's own response for a non-admin caller", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(
      NextResponse.json({ error: "Not found" }, { status: 404 })
    );
    const res = await GET(get());
    expect(res.status).toBe(404);
  });

  it("aggregates totals, byModel, byKind, and daily series", async () => {
    queueQueries([
      [{ gens: 50, tokens: 100000 }],
      [{ gens: 10, tokens: 20000 }],
      [{ model: "claude-sonnet-5", gens: 50, tokens: 100000 }],
      [{ kind: "reflection", gens: 50, tokens: 100000 }],
      [{ day: "2026-06-01", gens: 5, tokens: 9000 }],
    ]);

    const res = await GET(get());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toEqual({ gens: 50, tokens: 100000, estCostUsd: null });
    expect(body.monthToDate).toEqual({ gens: 10, tokens: 20000, estCostUsd: null });
    expect(body.byModel).toEqual([{ model: "claude-sonnet-5", gens: 50, tokens: 100000 }]);
    expect(body.byKind).toEqual([{ kind: "reflection", gens: 50, tokens: 100000 }]);
    expect(body.daily).toEqual([{ day: "2026-06-01", gens: 5, tokens: 9000 }]);
    expect(body.pricePer1k).toBeNull();
  });

  it("defaults totals to zero when there are no generations at all", async () => {
    queueQueries([[], [], [], [], []]);
    const res = await GET(get());
    const body = await res.json();
    expect(body.total.estCostUsd).toBeNull();
    expect(body.pricePer1k).toBeNull();
  });

  it("treats an unset AI_USD_PER_1K_TOKENS as null pricing (not a fabricated cost)", async () => {
    vi.stubEnv("AI_USD_PER_1K_TOKENS", "");
    queueQueries([[{ gens: 1, tokens: 1000 }], [], [], [], []]);
    const res = await GET(get());
    const body = await res.json();
    expect(body.pricePer1k).toBeNull();
    expect(body.total.estCostUsd).toBeNull();
  });

  it("treats an invalid AI_USD_PER_1K_TOKENS string as null pricing", async () => {
    vi.stubEnv("AI_USD_PER_1K_TOKENS", "not-a-number");
    queueQueries([[{ gens: 1, tokens: 1000 }], [], [], [], []]);
    const res = await GET(get());
    const body = await res.json();
    expect(body.pricePer1k).toBeNull();
  });

  it("treats a configured 0 as a real price, not unset", async () => {
    vi.stubEnv("AI_USD_PER_1K_TOKENS", "0");
    queueQueries([[{ gens: 1, tokens: 1000 }], [], [], [], []]);
    const res = await GET(get());
    const body = await res.json();
    expect(body.pricePer1k).toBe(0);
    expect(body.total.estCostUsd).toBe(0);
  });

  it("computes an estimated cost from tokens and a configured price", async () => {
    vi.stubEnv("AI_USD_PER_1K_TOKENS", "0.01");
    queueQueries([[{ gens: 1, tokens: 100000 }], [], [], [], []]);
    const res = await GET(get());
    const body = await res.json();
    expect(body.pricePer1k).toBe(0.01);
    expect(body.total.estCostUsd).toBe(1);
  });

  it("returns 500 without leaking internals when a query rejects", async () => {
    mockSelect.mockReturnValueOnce(makeRejectingChain(new Error("connection lost")));
    const res = await GET(get());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Internal server error");
  });
});
