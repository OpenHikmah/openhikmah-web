import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { User } from "@/lib/infra/db/schema";

vi.mock("@/lib/admin/admin-auth", () => ({
  requireAdmin: vi.fn(),
  rateLimitAdminMutation: vi.fn(() => null),
}));
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

const { mockSelect, mockInsert, mockUpdate, mockDelete } = vi.hoisted(() => ({
  mockSelect: vi.fn(() => makeDbChain([])),
  mockInsert: vi.fn(() => makeDbChain([])),
  mockUpdate: vi.fn(() => makeDbChain([])),
  mockDelete: vi.fn(() => makeDbChain([])),
}));
vi.mock("@/lib/infra/db", () => ({
  db: { select: mockSelect, insert: mockInsert, update: mockUpdate, delete: mockDelete },
}));

import { GET, POST, PUT, DELETE } from "@/app/api/admin/challenge-suggestions/route";
import { requireAdmin } from "@/lib/admin/admin-auth";

const admin = { userId: 1, user: { qfId: "qf-admin" } as User };
const row = {
  id: 3,
  title: "Patience",
  verseRef: "2:155",
  suggestedDuration: "7d",
  isActive: true,
  sortOrder: 0,
};

function req(method: string, body?: unknown, qs = "") {
  return new NextRequest(`http://localhost/api/admin/challenge-suggestions${qs}`, {
    method,
    headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.mocked(requireAdmin).mockResolvedValue(admin);
  mockSelect.mockReturnValue(makeDbChain([row]));
  mockInsert.mockReturnValue(makeDbChain([row]));
  mockUpdate.mockReturnValue(makeDbChain([row]));
  mockDelete.mockReturnValue(makeDbChain([row]));
});

describe("admin challenge-suggestions", () => {
  it("404s for a non-admin", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(
      NextResponse.json({ error: "Not found" }, { status: 404 })
    );
    expect((await GET(req("GET"))).status).toBe(404);
  });

  it("lists suggestions", async () => {
    const res = await GET(req("GET"));
    expect(res.status).toBe(200);
    expect((await res.json()).suggestions).toHaveLength(1);
  });

  it("rejects create without a title", async () => {
    expect((await POST(req("POST", { verseRef: "2:155" }))).status).toBe(400);
  });

  it("rejects an invalid verse ref", async () => {
    expect((await POST(req("POST", { title: "x", verseRef: "999:1" }))).status).toBe(400);
  });

  it("rejects an invalid duration", async () => {
    expect((await POST(req("POST", { title: "x", suggestedDuration: "3d" }))).status).toBe(400);
  });

  it("creates a valid suggestion (201)", async () => {
    const res = await POST(
      req("POST", { title: "Patience", verseRef: "2:155", suggestedDuration: "7d" })
    );
    expect(res.status).toBe(201);
    expect(mockInsert).toHaveBeenCalled();
  });

  it("rejects update with a bad id", async () => {
    expect((await PUT(req("PUT", { title: "x" }))).status).toBe(400);
  });

  it("updates a suggestion", async () => {
    const res = await PUT(req("PUT", { id: 3, title: "Patience v2" }));
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("rejects delete with a bad id", async () => {
    expect((await DELETE(req("DELETE", undefined, "?id=abc"))).status).toBe(400);
  });

  it("deletes a suggestion (204)", async () => {
    expect((await DELETE(req("DELETE", undefined, "?id=3"))).status).toBe(204);
  });
});
