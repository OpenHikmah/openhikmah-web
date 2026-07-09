import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { User } from "@/lib/infra/db/schema";

vi.mock("@/lib/admin/admin-auth", () => ({
  requireAdmin: vi.fn(),
  isAdminQfId: vi.fn(() => false),
}));
vi.mock("@/lib/admin/admin-audit", () => ({ logAdminAction: vi.fn() }));
vi.mock("@/lib/auth/social-auth", () => ({ clearTokenCache: vi.fn() }));

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

import { GET, PATCH } from "@/app/api/admin/users/route";
import { requireAdmin, isAdminQfId } from "@/lib/admin/admin-auth";
import { logAdminAction } from "@/lib/admin/admin-audit";
import { clearTokenCache } from "@/lib/auth/social-auth";

const admin = { userId: 1, user: { qfId: "qf-admin" } as User };

const targetUser = {
  id: 42,
  qfId: "qf-42",
  username: "someone",
  displayName: "Someone",
  createdAt: new Date("2026-01-01"),
  lastActiveAt: new Date("2026-01-02"),
  currentStreak: 3,
  longestStreak: 10,
  disabledAt: null,
};

function get(query?: string) {
  const url = query
    ? `http://localhost/api/admin/users?${query}`
    : "http://localhost/api/admin/users";
  return new NextRequest(url, { headers: { Authorization: "Bearer t" } });
}
function patch(body: unknown) {
  return new NextRequest("http://localhost/api/admin/users", {
    method: "PATCH",
    headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.mocked(requireAdmin).mockResolvedValue(admin);
  vi.mocked(isAdminQfId).mockReturnValue(false);
  mockSelect.mockReturnValue(makeDbChain([]));
  mockUpdate.mockReturnValue(makeDbChain([]));
  vi.mocked(logAdminAction).mockClear();
  vi.mocked(clearTokenCache).mockClear();
});

describe("GET /api/admin/users", () => {
  it("returns the guard's own response for a non-admin caller", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(
      NextResponse.json({ error: "Not found" }, { status: 404 })
    );
    const res = await GET(get());
    expect(res.status).toBe(404);
  });

  it("lists users with an isAdmin flag computed per row", async () => {
    mockSelect.mockReturnValue(makeDbChain([targetUser]));
    vi.mocked(isAdminQfId).mockReturnValue(true);

    const res = await GET(get());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.users).toHaveLength(1);
    expect(body.users[0].isAdmin).toBe(true);
    expect(body.users[0].username).toBe("someone");
  });
});

describe("PATCH /api/admin/users", () => {
  it("returns 400 for a malformed body", async () => {
    const req = new NextRequest("http://localhost/api/admin/users", {
      method: "PATCH",
      headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
      body: "not-json",
    });
    expect((await PATCH(req)).status).toBe(400);
  });

  it("returns 400 when id or disabled has the wrong type", async () => {
    expect((await PATCH(patch({ id: "42", disabled: true }))).status).toBe(400);
    expect((await PATCH(patch({ id: 42, disabled: "yes" }))).status).toBe(400);
  });

  it("returns 404 when the target user doesn't exist", async () => {
    mockSelect.mockReturnValue(makeDbChain([]));
    const res = await PATCH(patch({ id: 42, disabled: true }));
    expect(res.status).toBe(404);
  });

  it("returns 403 when attempting to disable an admin account", async () => {
    mockSelect.mockReturnValue(makeDbChain([targetUser]));
    vi.mocked(isAdminQfId).mockReturnValue(true);

    const res = await PATCH(patch({ id: 42, disabled: true }));
    expect(res.status).toBe(403);
  });

  it("disables a non-admin user, clears the token cache, and logs the action", async () => {
    mockSelect.mockReturnValue(makeDbChain([targetUser]));
    mockUpdate.mockReturnValue(makeDbChain([{ id: 42, disabledAt: new Date("2026-06-01") }]));

    const res = await PATCH(patch({ id: 42, disabled: true }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(42);
    expect(clearTokenCache).toHaveBeenCalled();
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "user.disable", targetId: "42" })
    );
  });

  it("re-enables a user and logs user.enable", async () => {
    mockSelect.mockReturnValue(makeDbChain([{ ...targetUser, disabledAt: new Date() }]));
    mockUpdate.mockReturnValue(makeDbChain([{ id: 42, disabledAt: null }]));

    const res = await PATCH(patch({ id: 42, disabled: false }));
    expect(res.status).toBe(200);
    expect(logAdminAction).toHaveBeenCalledWith(expect.objectContaining({ action: "user.enable" }));
  });

  it("returns 404 if the row disappears between the select and the update", async () => {
    mockSelect.mockReturnValue(makeDbChain([targetUser]));
    mockUpdate.mockReturnValue(makeDbChain([]));

    const res = await PATCH(patch({ id: 42, disabled: true }));
    expect(res.status).toBe(404);
  });
});
