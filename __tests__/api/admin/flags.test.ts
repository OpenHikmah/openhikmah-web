import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { User } from "@/lib/infra/db/schema";

vi.mock("@/lib/admin/admin-auth", () => ({
  requireAdmin: vi.fn(),
  rateLimitAdminMutation: vi.fn(() => null),
}));
vi.mock("@/lib/admin/admin-audit", () => ({ logAdminAction: vi.fn() }));
vi.mock("@/lib/admin/feature-flags", async () => {
  const actual = await vi.importActual<typeof import("@/lib/admin/feature-flags")>(
    "@/lib/admin/feature-flags"
  );
  return { invalidateFlagCache: vi.fn(), validateFlagType: actual.validateFlagType };
});

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

const { mockSelect, mockInsert, mockDelete } = vi.hoisted(() => ({
  mockSelect: vi.fn(() => makeDbChain([])),
  mockInsert: vi.fn(() => makeDbChain([])),
  mockDelete: vi.fn(() => makeDbChain([])),
}));
vi.mock("@/lib/infra/db", () => ({
  db: { select: mockSelect, insert: mockInsert, delete: mockDelete },
}));

import { GET, PUT, DELETE } from "@/app/api/admin/flags/route";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { logAdminAction } from "@/lib/admin/admin-audit";
import { invalidateFlagCache } from "@/lib/admin/feature-flags";

const admin = { userId: 1, user: { qfId: "qf-admin" } as User };

function get() {
  return new NextRequest("http://localhost/api/admin/flags", {
    headers: { Authorization: "Bearer t" },
  });
}
function put(body: unknown) {
  return new NextRequest("http://localhost/api/admin/flags", {
    method: "PUT",
    headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
function del(key?: string) {
  const url = key
    ? `http://localhost/api/admin/flags?key=${key}`
    : "http://localhost/api/admin/flags";
  return new NextRequest(url, { method: "DELETE", headers: { Authorization: "Bearer t" } });
}

beforeEach(() => {
  vi.mocked(requireAdmin).mockResolvedValue(admin);
  mockSelect.mockReturnValue(makeDbChain([]));
  mockInsert.mockReturnValue(makeDbChain([]));
  mockDelete.mockReturnValue(makeDbChain([]));
  vi.mocked(logAdminAction).mockClear();
  vi.mocked(invalidateFlagCache).mockClear();
});

describe("GET /api/admin/flags", () => {
  it("returns the guard's own response for a non-admin caller", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(
      NextResponse.json({ error: "Not found" }, { status: 404 })
    );
    const res = await GET(get());
    expect(res.status).toBe(404);
  });

  it("returns flags with parsed JSON values", async () => {
    mockSelect.mockReturnValue(
      makeDbChain([
        {
          key: "new-canvas",
          value: JSON.stringify({ enabled: true }),
          updatedBy: "qf-admin",
          updatedAt: new Date("2026-01-01"),
        },
      ])
    );
    const res = await GET(get());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.flags[0].value).toEqual({ enabled: true });
  });

  it("falls back to the raw string when a value isn't valid JSON", async () => {
    mockSelect.mockReturnValue(
      makeDbChain([{ key: "bad", value: "not-json", updatedBy: "qf-admin", updatedAt: new Date() }])
    );
    const res = await GET(get());
    const body = await res.json();
    expect(body.flags[0].value).toBe("not-json");
  });
});

describe("PUT /api/admin/flags", () => {
  it("returns 400 for a malformed body", async () => {
    const req = new NextRequest("http://localhost/api/admin/flags", {
      method: "PUT",
      headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
      body: "not-json",
    });
    expect((await PUT(req)).status).toBe(400);
  });

  it("returns 400 for an invalid key", async () => {
    expect((await PUT(put({ key: "Bad Key!", value: true }))).status).toBe(400);
    expect((await PUT(put({ key: "", value: true }))).status).toBe(400);
  });

  it("returns 400 when value is missing", async () => {
    const res = await PUT(put({ key: "valid-key" }));
    expect(res.status).toBe(400);
  });

  it("upserts a valid flag and logs the action", async () => {
    const res = await PUT(put({ key: "new-canvas", value: { enabled: true } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.key).toBe("new-canvas");
    expect(body.value).toEqual({ enabled: true });
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "flag.set", targetId: "new-canvas" })
    );
    expect(invalidateFlagCache).toHaveBeenCalledWith("new-canvas");
  });

  it("accepts value: false (not treated as missing)", async () => {
    const res = await PUT(put({ key: "some-flag", value: false }));
    expect(res.status).toBe(200);
  });

  it("rejects a type mismatch for a known operational-setting key", async () => {
    const insertCallsBefore = mockInsert.mock.calls.length;
    const res = await PUT(put({ key: "ai_gen_limit", value: "not-a-number" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/ai_gen_limit/);
    expect(mockInsert.mock.calls.length).toBe(insertCallsBefore);
  });

  it("accepts a correctly-typed value for a known operational-setting key", async () => {
    const res = await PUT(put({ key: "ai_gen_limit", value: 30 }));
    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/admin/flags", () => {
  it("returns 400 for a missing key", async () => {
    expect((await DELETE(del())).status).toBe(400);
  });

  it("returns 400 for an invalid key", async () => {
    expect((await DELETE(del("Bad Key!"))).status).toBe(400);
  });

  it("deletes a valid key and logs the action", async () => {
    const res = await DELETE(del("new-canvas"));
    expect(res.status).toBe(204);
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "flag.delete", targetId: "new-canvas" })
    );
    expect(invalidateFlagCache).toHaveBeenCalledWith("new-canvas");
  });
});
