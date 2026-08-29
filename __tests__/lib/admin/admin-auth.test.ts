import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { User } from "@/lib/infra/db/schema";

vi.mock("@/lib/auth/social-auth", () => ({ requireUser: vi.fn() }));

const { mockRateLimitOrNull } = vi.hoisted(() => ({
  mockRateLimitOrNull: vi.fn(
    async (
      _key: string,
      _message: string,
      _limit?: number,
      _windowSeconds?: number
    ): Promise<null> => null
  ),
}));
vi.mock("@/lib/infra/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/infra/rate-limit")>();
  return { ...actual, rateLimitOrNull: mockRateLimitOrNull };
});
vi.mock("@/lib/admin/feature-flags", () => ({
  getFlagNumber: vi.fn(async (_key: string, fallback: number) => fallback),
}));

import {
  isAdminQfId,
  requireAdmin,
  rateLimitAdminMutation,
  rateLimitAdminSelfHeal,
} from "@/lib/admin/admin-auth";
import { requireUser, type AuthedUser } from "@/lib/auth/social-auth";
import { ADMIN_MUTATION_LIMIT, ADMIN_MUTATION_WINDOW_SECONDS } from "@/lib/infra/rate-limit";

function makeUser(qfId: string): User {
  return {
    id: 1,
    qfId,
    username: "u",
    displayName: null,
    createdAt: new Date(),
    lastActiveAt: new Date(),
    currentStreak: 0,
    longestStreak: 0,
    lastActivityDate: null,
    disabledAt: null,
  };
}

const req = () =>
  new NextRequest("http://localhost/api/admin/me", {
    headers: { Authorization: "Bearer t" },
  });

const original = process.env.ADMIN_QF_IDS;
afterEach(() => {
  process.env.ADMIN_QF_IDS = original;
});

describe("isAdminQfId", () => {
  it("is fail-closed when the allowlist is unset", () => {
    delete process.env.ADMIN_QF_IDS;
    expect(isAdminQfId("qf-1")).toBe(false);
  });

  it("is fail-closed when the allowlist is empty/whitespace", () => {
    process.env.ADMIN_QF_IDS = "  , ,";
    expect(isAdminQfId("qf-1")).toBe(false);
  });

  it("matches ids in a comma-separated, space-tolerant list", () => {
    process.env.ADMIN_QF_IDS = "qf-1, qf-2 ,qf-3";
    expect(isAdminQfId("qf-2")).toBe(true);
    expect(isAdminQfId("qf-3")).toBe(true);
    expect(isAdminQfId("qf-9")).toBe(false);
  });

  it("rejects null/empty input", () => {
    process.env.ADMIN_QF_IDS = "qf-1";
    expect(isAdminQfId(null)).toBe(false);
    expect(isAdminQfId(undefined)).toBe(false);
    expect(isAdminQfId("")).toBe(false);
  });
});

describe("requireAdmin", () => {
  beforeEach(() => vi.mocked(requireUser).mockReset());

  it("passes through the auth guard's response when not signed in", async () => {
    vi.mocked(requireUser).mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    );
    const res = await requireAdmin(req());
    expect(res).toBeInstanceOf(NextResponse);
    expect((res as NextResponse).status).toBe(401);
  });

  it("returns 404 for a signed-in non-admin (does not reveal the surface)", async () => {
    process.env.ADMIN_QF_IDS = "qf-admin";
    vi.mocked(requireUser).mockResolvedValue({ userId: 1, user: makeUser("qf-other") });
    const res = await requireAdmin(req());
    expect((res as NextResponse).status).toBe(404);
  });

  it("returns the authed user for an allowlisted admin", async () => {
    process.env.ADMIN_QF_IDS = "qf-admin";
    const authed = { userId: 1, user: makeUser("qf-admin") };
    vi.mocked(requireUser).mockResolvedValue(authed);
    const res = await requireAdmin(req());
    expect(res).toBe(authed);
  });
});

describe("admin mutation rate limiting", () => {
  const auth = { userId: 42, user: makeUser("qf-admin") } as AuthedUser;

  beforeEach(() => mockRateLimitOrNull.mockClear());

  it("uses a dedicated admin budget, not the flagless end-user default", async () => {
    await rateLimitAdminMutation(auth);
    const [key, , limit, windowSeconds] = mockRateLimitOrNull.mock.calls[0];
    expect(key).toBe("admin-mutation:42");
    expect(limit).toBe(ADMIN_MUTATION_LIMIT);
    expect(windowSeconds).toBe(ADMIN_MUTATION_WINDOW_SECONDS);
  });

  it("self-heal writes are metered on a separate key from interactive mutations", async () => {
    await rateLimitAdminSelfHeal(auth);
    expect(mockRateLimitOrNull.mock.calls[0][0]).toBe("admin-selfheal:42");
  });
});
