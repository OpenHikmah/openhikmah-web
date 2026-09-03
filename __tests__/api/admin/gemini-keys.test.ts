import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { User } from "@/lib/infra/db/schema";

vi.mock("@/lib/admin/admin-auth", () => ({ requireAdmin: vi.fn() }));

const { mockConfiguredGeminiKeys } = vi.hoisted(() => ({
  mockConfiguredGeminiKeys: vi.fn(() => ["GEMINI_API1", "GEMINI_API3"]),
}));
vi.mock("@/lib/admin/job-runner", () => ({ configuredGeminiKeys: mockConfiguredGeminiKeys }));

import { GET } from "@/app/api/admin/gemini-keys/route";
import { requireAdmin } from "@/lib/admin/admin-auth";

const admin = { userId: 1, user: { qfId: "qf-admin" } as User };
const req = () =>
  new NextRequest("http://localhost/api/admin/gemini-keys", {
    headers: { Authorization: "Bearer t" },
  });

beforeEach(() => {
  vi.mocked(requireAdmin).mockResolvedValue(admin);
  mockConfiguredGeminiKeys.mockClear().mockReturnValue(["GEMINI_API1", "GEMINI_API3"]);
});

describe("GET /api/admin/gemini-keys", () => {
  it("returns the configured key names for an admin", async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ keys: ["GEMINI_API1", "GEMINI_API3"] });
  });

  it("returns the guard's response for a non-admin", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(
      NextResponse.json({ error: "Not found" }, { status: 404 })
    );
    const res = await GET(req());
    expect(res.status).toBe(404);
    expect(mockConfiguredGeminiKeys).not.toHaveBeenCalled();
  });
});
