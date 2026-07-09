import { describe, it, expect, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { User } from "@/lib/infra/db/schema";

vi.mock("@/lib/admin/admin-auth", () => ({ requireAdmin: vi.fn() }));

import { GET } from "@/app/api/admin/me/route";
import { requireAdmin } from "@/lib/admin/admin-auth";

const admin = { userId: 1, user: { qfId: "qf-admin", username: "admin_user" } as User };

function req() {
  return new NextRequest("http://localhost/api/admin/me", {
    headers: { Authorization: "Bearer t" },
  });
}

describe("GET /api/admin/me", () => {
  it("returns the admin identity", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(admin);
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ qfId: "qf-admin", username: "admin_user" });
  });

  it("returns the guard's own response for a non-admin caller", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(
      NextResponse.json({ error: "Not found" }, { status: 404 })
    );
    const res = await GET(req());
    expect(res.status).toBe(404);
  });

  it("returns the guard's own 401 for an unauthenticated caller", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    );
    const res = await GET(req());
    expect(res.status).toBe(401);
  });
});
