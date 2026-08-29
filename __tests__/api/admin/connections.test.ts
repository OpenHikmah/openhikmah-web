import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { User } from "@/lib/infra/db/schema";

vi.mock("@/lib/admin/admin-auth", () => ({
  requireAdmin: vi.fn(),
  rateLimitAdminMutation: vi.fn(() => null),
}));
vi.mock("@/lib/admin/admin-audit", () => ({ logAdminAction: vi.fn() }));

function makeDbChain(resolveWith: unknown = [], calls?: Array<[string, unknown[]]>) {
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
        return (...args: unknown[]) => {
          calls?.push([String(prop), args]);
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

const { mockSelect, mockUpdate } = vi.hoisted(() => ({
  mockSelect: vi.fn(() => makeDbChain([])),
  mockUpdate: vi.fn(() => makeDbChain([])),
}));
vi.mock("@/lib/infra/db", () => ({ db: { select: mockSelect, update: mockUpdate } }));

import { GET, PATCH } from "@/app/api/admin/connections/route";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { logAdminAction } from "@/lib/admin/admin-audit";

const admin = { userId: 1, user: { qfId: "qf-admin" } as User };

const connectionRow = {
  id: 7,
  fromRef: "2:255",
  toRef: "24:35",
  kind: "thematic",
  status: "active",
  createdAt: new Date("2026-01-01"),
};

function get(query?: string) {
  const url = query
    ? `http://localhost/api/admin/connections?${query}`
    : "http://localhost/api/admin/connections";
  return new NextRequest(url, { headers: { Authorization: "Bearer t" } });
}
function patch(body: unknown) {
  return new NextRequest("http://localhost/api/admin/connections", {
    method: "PATCH",
    headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.mocked(requireAdmin).mockResolvedValue(admin);
  mockSelect.mockReset();
  mockUpdate.mockReset();
  // Default: the PATCH status branch reads the prior row first — an active one.
  mockSelect.mockReturnValue(makeDbChain([{ status: "active" }]));
  mockUpdate.mockReturnValue(makeDbChain([]));
  vi.mocked(logAdminAction).mockClear();
});

describe("GET /api/admin/connections", () => {
  it("returns the guard's own response for a non-admin caller", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(
      NextResponse.json({ error: "Not found" }, { status: 404 })
    );
    const res = await GET(get());
    expect(res.status).toBe(404);
  });

  it("returns 400 for an unknown status filter", async () => {
    const res = await GET(get("status=bogus"));
    expect(res.status).toBe(400);
  });

  it("returns 400 for an unknown kind filter", async () => {
    const res = await GET(get("kind=bogus"));
    expect(res.status).toBe(400);
  });

  it("returns 400 for an unknown reviewed filter", async () => {
    const res = await GET(get("reviewed=bogus"));
    expect(res.status).toBe(400);
  });

  it("lists connections with valid filters", async () => {
    mockSelect.mockReturnValue(makeDbChain([connectionRow]));
    const res = await GET(get("status=active&kind=thematic"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.connections).toEqual([
      { ...connectionRow, createdAt: connectionRow.createdAt.toISOString() },
    ]);
  });

  it("accepts reviewed=pending and reviewed=reviewed filters", async () => {
    mockSelect.mockReturnValue(makeDbChain([connectionRow]));
    expect((await GET(get("reviewed=pending"))).status).toBe(200);
    expect((await GET(get("reviewed=reviewed"))).status).toBe(200);
  });

  it("reports hasMore and caps the page when an extra row comes back", async () => {
    const many = Array.from({ length: 51 }, (_, i) => ({ ...connectionRow, id: i + 1 }));
    mockSelect.mockReturnValue(makeDbChain(many));
    const body = await (await GET(get())).json();
    expect(body.connections).toHaveLength(50);
    expect(body.hasMore).toBe(true);
  });

  it("passes the requested offset through to the query", async () => {
    const calls: Array<[string, unknown[]]> = [];
    mockSelect.mockReturnValue(makeDbChain([], calls));
    await GET(get("offset=50"));
    expect(calls).toContainEqual(["offset", [50]]);
  });

  it("reports hasMore=false when the page isn't full", async () => {
    mockSelect.mockReturnValue(makeDbChain([connectionRow]));
    const body = await (await GET(get())).json();
    expect(body.hasMore).toBe(false);
  });
});

describe("PATCH /api/admin/connections", () => {
  it("returns 400 for a malformed body", async () => {
    const req = new NextRequest("http://localhost/api/admin/connections", {
      method: "PATCH",
      headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
      body: "not-json",
    });
    expect((await PATCH(req)).status).toBe(400);
  });

  it("returns 400 for a non-integer id", async () => {
    const res = await PATCH(patch({ id: "abc", status: "flagged" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for an invalid status", async () => {
    const res = await PATCH(patch({ id: 7, status: "bogus" }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when the connection doesn't exist", async () => {
    mockSelect.mockReturnValue(makeDbChain([]));
    const res = await PATCH(patch({ id: 7, status: "flagged" }));
    expect(res.status).toBe(404);
  });

  it("updates the status and logs the action", async () => {
    mockUpdate.mockReturnValue(makeDbChain([{ ...connectionRow, status: "flagged" }]));
    const res = await PATCH(patch({ id: 7, status: "flagged" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.connection.status).toBe("flagged");
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "connection.status", targetId: "7" })
    );
  });

  it("returns 400 when neither status nor reviewed is specified", async () => {
    const res = await PATCH(patch({ id: 7 }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when marking reviewed on a connection that doesn't exist", async () => {
    mockUpdate.mockReturnValue(makeDbChain([]));
    const res = await PATCH(patch({ id: 7, reviewed: true }));
    expect(res.status).toBe(404);
  });

  it("clears the exhausted coverage cell when a connection is retired", async () => {
    const setCalls: Array<Record<string, unknown>> = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function recordingChain(resolveWith: unknown): any {
      return new Proxy(function () {}, {
        get(_t, prop) {
          if (prop === "then")
            return (res: (v: unknown) => unknown) => Promise.resolve(resolveWith).then(res);
          if (prop === "set")
            return (payload: Record<string, unknown>) => {
              setCalls.push(payload);
              return recordingChain(resolveWith);
            };
          return () => recordingChain(resolveWith);
        },
        apply() {
          return recordingChain(resolveWith);
        },
      });
    }

    mockSelect.mockReturnValue(makeDbChain([{ status: "active" }]));
    mockUpdate
      .mockReturnValueOnce(recordingChain([{ ...connectionRow, status: "retired" }]))
      .mockReturnValueOnce(recordingChain([]));

    const res = await PATCH(patch({ id: 7, status: "retired" }));
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledTimes(2);
    expect(setCalls[1]).toMatchObject({ exhaustedAt: null });
  });

  it("does not move coverage when the status doesn't actually change active-ness", async () => {
    mockSelect.mockReturnValue(makeDbChain([{ status: "flagged" }]));
    mockUpdate.mockReturnValue(makeDbChain([{ ...connectionRow, status: "retired" }]));
    const res = await PATCH(patch({ id: 7, status: "retired" }));
    expect(res.status).toBe(200);
    // Only the connections row update — flagged→retired is inactive→inactive.
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it("increments coverage and un-strands the cell when a connection is reactivated", async () => {
    const setCalls: Array<Record<string, unknown>> = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function recordingChain(resolveWith: unknown): any {
      return new Proxy(function () {}, {
        get(_t, prop) {
          if (prop === "then")
            return (res: (v: unknown) => unknown) => Promise.resolve(resolveWith).then(res);
          if (prop === "set")
            return (payload: Record<string, unknown>) => {
              setCalls.push(payload);
              return recordingChain(resolveWith);
            };
          return () => recordingChain(resolveWith);
        },
        apply() {
          return recordingChain(resolveWith);
        },
      });
    }

    mockSelect.mockReturnValue(makeDbChain([{ status: "retired" }]));
    mockUpdate
      .mockReturnValueOnce(recordingChain([{ ...connectionRow, status: "active" }]))
      .mockReturnValueOnce(recordingChain([]));

    const res = await PATCH(patch({ id: 7, status: "active" }));
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledTimes(2);
    expect(setCalls[1]).toMatchObject({ exhaustedAt: null });
  });

  it("marks a connection reviewed without changing status and logs connection.reviewed", async () => {
    mockUpdate.mockReturnValue(
      makeDbChain([{ ...connectionRow, reviewedAt: new Date("2026-01-02") }])
    );
    const res = await PATCH(patch({ id: 7, reviewed: true }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.connection.status).toBe("active");
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "connection.reviewed", targetId: "7" })
    );
  });
});
