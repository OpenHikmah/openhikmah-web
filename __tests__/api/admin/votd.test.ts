import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type { User } from "@/lib/db/schema";

vi.mock("@/lib/admin-auth", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/admin-audit", () => ({ logAdminAction: vi.fn() }));
vi.mock("@/lib/verse-resolver", () => ({ resolveVerse: vi.fn() }));

// Chainable db stub: every method returns the chain; awaiting it resolves to the
// configured value. Covers select/from/where and insert/values/onConflictDoUpdate.
function makeDbChain(resolveWith: unknown = []) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = new Proxy(function () { return chain; }, {
    get(_t, prop) {
      if (prop === "then")
        return (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
          Promise.resolve(resolveWith).then(res, rej);
      return () => chain;
    },
    apply() { return chain; },
  });
  return chain;
}

const { mockSelect, mockInsert, mockDelete } = vi.hoisted(() => ({
  mockSelect: vi.fn(() => makeDbChain([])),
  mockInsert: vi.fn(() => makeDbChain([])),
  mockDelete: vi.fn(() => makeDbChain([])),
}));
vi.mock("@/lib/db", () => ({ db: { select: mockSelect, insert: mockInsert, delete: mockDelete } }));

import { GET, PUT, DELETE } from "@/app/api/admin/votd/route";
import { requireAdmin } from "@/lib/admin-auth";
import { resolveVerse } from "@/lib/verse-resolver";

const admin = { userId: 1, user: { qfId: "qf-admin" } as User };

function get(month?: string) {
  const url = month ? `http://localhost/api/admin/votd?month=${month}` : "http://localhost/api/admin/votd";
  return new NextRequest(url, { headers: { Authorization: "Bearer t" } });
}
function put(body: unknown) {
  return new NextRequest("http://localhost/api/admin/votd", {
    method: "PUT",
    headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
function del(date?: string) {
  const url = date ? `http://localhost/api/admin/votd?date=${date}` : "http://localhost/api/admin/votd";
  return new NextRequest(url, { method: "DELETE", headers: { Authorization: "Bearer t" } });
}

beforeEach(() => {
  vi.mocked(requireAdmin).mockResolvedValue(admin);
  vi.mocked(resolveVerse).mockReset();
  mockSelect.mockReturnValue(makeDbChain([]));
  mockInsert.mockReturnValue(makeDbChain([]));
  mockDelete.mockReturnValue(makeDbChain([]));
});

describe("GET /api/admin/votd", () => {
  it("rejects a malformed month", async () => {
    expect((await GET(get("2026-13-01"))).status).toBe(400);
  });

  it("does not 500 on a short month (half-open range, not a hardcoded -31)", async () => {
    // Regression: the old `${month}-31` upper bound produced an invalid date for
    // February and could fail the DB comparison.
    const res = await GET(get("2026-02"));
    expect(res.status).toBe(200);
  });
});

describe("PUT /api/admin/votd", () => {
  it("rejects an impossible calendar date", async () => {
    const res = await PUT(put({ date: "2026-02-31", verseRef: "2:255" }));
    expect(res.status).toBe(400);
  });

  it("rejects an out-of-range verse reference", async () => {
    const res = await PUT(put({ date: "2026-06-21", verseRef: "999:1" }));
    expect(res.status).toBe(400);
  });

  it("does not throw when reflection is a non-string", async () => {
    vi.mocked(resolveVerse).mockResolvedValue({ ref: "2:255" } as never);
    const res = await PUT(put({ date: "2026-06-21", verseRef: "2:255", reflection: 123 }));
    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/admin/votd", () => {
  it("rejects an impossible calendar date", async () => {
    expect((await DELETE(del("2026-02-31"))).status).toBe(400);
  });

  it("clears a valid date", async () => {
    expect((await DELETE(del("2026-06-21"))).status).toBe(204);
  });
});
