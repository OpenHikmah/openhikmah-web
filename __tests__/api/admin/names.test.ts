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

const { mockSelect, mockUpdate, mockDelete } = vi.hoisted(() => ({
  mockSelect: vi.fn(() => makeDbChain([])),
  mockUpdate: vi.fn(() => makeDbChain([])),
  mockDelete: vi.fn(() => makeDbChain([])),
}));
vi.mock("@/lib/infra/db", () => ({
  db: { select: mockSelect, update: mockUpdate, delete: mockDelete },
}));

import { GET, PATCH, DELETE } from "@/app/api/admin/names/route";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { logAdminAction } from "@/lib/admin/admin-audit";

const admin = { userId: 1, user: { qfId: "qf-admin" } as User };

function get() {
  return new NextRequest("http://localhost/api/admin/names", {
    headers: { Authorization: "Bearer t" },
  });
}
function patch(body: unknown) {
  return new NextRequest("http://localhost/api/admin/names", {
    method: "PATCH",
    headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
function del(query?: string) {
  const url = query
    ? `http://localhost/api/admin/names?${query}`
    : "http://localhost/api/admin/names";
  return new NextRequest(url, { method: "DELETE", headers: { Authorization: "Bearer t" } });
}

beforeEach(() => {
  vi.mocked(requireAdmin).mockResolvedValue(admin);
  mockSelect.mockReturnValue(makeDbChain([]));
  mockUpdate.mockReturnValue(makeDbChain([]));
  mockDelete.mockReturnValue(makeDbChain([]));
  vi.mocked(logAdminAction).mockClear();
});

describe("GET /api/admin/names", () => {
  it("returns the guard's own response for a non-admin caller", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(
      NextResponse.json({ error: "Not found" }, { status: 404 })
    );
    const res = await GET(get());
    expect(res.status).toBe(404);
  });

  it("returns rows with parsed data and falls back to raw string on bad JSON", async () => {
    mockSelect.mockReturnValue(
      makeDbChain([
        {
          slug: "ar-rahman",
          kind: "reflection",
          data: JSON.stringify({ text: "hi" }),
          model: "claude",
          version: 1,
          updatedAt: new Date("2026-01-01"),
        },
        {
          slug: "ar-rahim",
          kind: "reflection",
          data: "not-json",
          model: "claude",
          version: 1,
          updatedAt: new Date("2026-01-01"),
        },
      ])
    );
    const res = await GET(get());
    const body = await res.json();
    expect(body.rows[0].data).toEqual({ text: "hi" });
    expect(body.rows[1].data).toBe("not-json");
  });
});

describe("PATCH /api/admin/names", () => {
  it("returns 400 for a malformed body", async () => {
    const req = new NextRequest("http://localhost/api/admin/names", {
      method: "PATCH",
      headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
      body: "not-json",
    });
    expect((await PATCH(req)).status).toBe(400);
  });

  it("returns 400 for a missing slug or invalid kind", async () => {
    expect((await PATCH(patch({ slug: "", kind: "verses", data: {} }))).status).toBe(400);
    expect((await PATCH(patch({ slug: "ar-rahman", kind: "bogus", data: {} }))).status).toBe(400);
  });

  it("returns 400 when data is missing", async () => {
    const res = await PATCH(patch({ slug: "ar-rahman", kind: "verses" }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when there's no cached row for that slug/kind", async () => {
    mockUpdate.mockReturnValue(makeDbChain([]));
    const res = await PATCH(patch({ slug: "ar-rahman", kind: "verses", data: { a: 1 } }));
    expect(res.status).toBe(404);
  });

  it("updates the cached content and logs the action", async () => {
    mockUpdate.mockReturnValue(makeDbChain([{ slug: "ar-rahman", kind: "verses" }]));
    const res = await PATCH(patch({ slug: "ar-rahman", kind: "verses", data: { a: 1 } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ a: 1 });
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "name.edit", targetId: "ar-rahman/verses" })
    );
  });
});

describe("DELETE /api/admin/names", () => {
  it("returns 400 for a missing slug or kind", async () => {
    expect((await DELETE(del())).status).toBe(400);
    expect((await DELETE(del("slug=ar-rahman"))).status).toBe(400);
  });

  it("returns 400 for an invalid kind", async () => {
    expect((await DELETE(del("slug=ar-rahman&kind=bogus"))).status).toBe(400);
  });

  it("invalidates the cache entry and logs the action", async () => {
    const res = await DELETE(del("slug=ar-rahman&kind=verses"));
    expect(res.status).toBe(204);
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "name.invalidate", targetId: "ar-rahman/verses" })
    );
  });
});
