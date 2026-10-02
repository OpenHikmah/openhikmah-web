import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { User } from "@/lib/infra/db/schema";

vi.mock("@/lib/admin/admin-auth", () => ({ requireAdmin: vi.fn() }));

const { mockGetProgress, mockGetTranslations } = vi.hoisted(() => ({
  mockGetProgress: vi.fn(),
  mockGetTranslations: vi.fn(),
}));
vi.mock("@/lib/ai/verification-progress", () => ({
  getVerificationProgress: mockGetProgress,
  getTranslationProgress: mockGetTranslations,
}));

import { GET } from "@/app/api/admin/verification/route";
import { requireAdmin } from "@/lib/admin/admin-auth";

const admin = { userId: 1, user: { qfId: "qf-admin" } as User };
const get = () =>
  new NextRequest("http://localhost/api/admin/verification", {
    headers: { Authorization: "Bearer t" },
  });

const progress = {
  verses: { total: 100, done: 40, remaining: 60, percent: 40 },
  cells: { total: 300, done: 120, remaining: 180, percent: 40 },
  connections: { total: 900, done: 360, remaining: 540, percent: 40 },
};

const translations = {
  rows: { total: 300, done: 90, remaining: 210, percent: 30 },
  byLocale: {
    az: { total: 100, done: 30, remaining: 70, percent: 30 },
    ru: { total: 100, done: 30, remaining: 70, percent: 30 },
    tr: { total: 100, done: 30, remaining: 70, percent: 30 },
  },
};

beforeEach(() => {
  vi.mocked(requireAdmin).mockResolvedValue(admin);
  mockGetProgress.mockReset().mockResolvedValue(progress);
  mockGetTranslations.mockReset().mockResolvedValue(translations);
});

describe("GET /api/admin/verification", () => {
  it("returns the guard response for a non-admin and never queries", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(
      NextResponse.json({ error: "Not found" }, { status: 404 })
    );
    const res = await GET(get());
    expect(res.status).toBe(404);
    expect(mockGetProgress).not.toHaveBeenCalled();
    expect(mockGetTranslations).not.toHaveBeenCalled();
  });

  it("returns both the connection and the translation re-verification progress", async () => {
    const res = await GET(get());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ connections: progress, translations });
  });

  it("returns a 500 without leaking the error when either query fails", async () => {
    mockGetTranslations.mockRejectedValue(new Error("connection refused on 10.0.0.5"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await GET(get());
    errSpy.mockRestore();
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("10.0.0.5");
  });
});
