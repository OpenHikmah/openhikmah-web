import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { User } from "@/lib/infra/db/schema";

vi.mock("@/lib/admin/admin-auth", () => ({ requireAdmin: vi.fn() }));

const { mockGetCoverageReport } = vi.hoisted(() => ({
  mockGetCoverageReport: vi.fn(),
}));
vi.mock("@/lib/admin/coverage-report", () => ({ getCoverageReport: mockGetCoverageReport }));

import { GET } from "@/app/api/admin/coverage/route";
import { requireAdmin } from "@/lib/admin/admin-auth";

const admin = { userId: 1, user: { qfId: "qf-admin" } as User };

function get(qs = "") {
  return new NextRequest(`http://localhost/api/admin/coverage${qs}`, {
    headers: { Authorization: "Bearer t" },
  });
}

beforeEach(() => {
  vi.mocked(requireAdmin).mockResolvedValue(admin);
  mockGetCoverageReport.mockReset().mockResolvedValue({
    totalVerses: 6236,
    matrix: [],
    focusLocale: "en",
    surahs: [],
    focusKind: "thematic",
    missingSample: [],
    missingSampleTotal: 0,
  });
});

describe("GET /api/admin/coverage", () => {
  it("returns the guard's response for a non-admin", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(
      NextResponse.json({ error: "Not found" }, { status: 404 })
    );
    expect((await GET(get())).status).toBe(404);
  });

  it("returns the report shape for an admin", async () => {
    const res = await GET(get());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalVerses).toBe(6236);
  });

  it("rejects an invalid kind or locale with 400", async () => {
    expect((await GET(get("?kind=bogus"))).status).toBe(400);
    expect((await GET(get("?locale=de"))).status).toBe(400);
    expect(mockGetCoverageReport).not.toHaveBeenCalled();
  });

  it("passes through valid filters", async () => {
    await GET(get("?kind=root&locale=tr"));
    expect(mockGetCoverageReport).toHaveBeenCalledWith({ kind: "root", locale: "tr" });
  });
});
