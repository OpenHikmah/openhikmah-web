import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { User } from "@/lib/infra/db/schema";

vi.mock("@/lib/admin/admin-auth", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/admin/admin-audit", () => ({ logAdminAction: vi.fn() }));

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
  mockSelect.mockReturnValue(makeDbChain([]));
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

  it("lists connections with valid filters", async () => {
    mockSelect.mockReturnValue(makeDbChain([connectionRow]));
    const res = await GET(get("status=active&kind=thematic"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.connections).toEqual([
      { ...connectionRow, createdAt: connectionRow.createdAt.toISOString() },
    ]);
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
    mockUpdate.mockReturnValue(makeDbChain([]));
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
});
