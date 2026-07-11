import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { User } from "@/lib/infra/db/schema";

vi.mock("@/lib/admin/admin-auth", () => ({
  requireAdmin: vi.fn(),
  rateLimitAdminMutation: vi.fn(() => null),
}));
vi.mock("@/lib/admin/admin-audit", () => ({ logAdminAction: vi.fn() }));

const { mockGetJobsStatus, mockEmbedCoverage, mockStartJob } = vi.hoisted(() => ({
  mockGetJobsStatus: vi.fn<() => Promise<unknown[]>>(() => Promise.resolve([])),
  mockEmbedCoverage: vi.fn(() => Promise.resolve({ embedded: 0, total: 0 })),
  mockStartJob: vi.fn(() => Promise.resolve({ runId: 1 })),
}));
vi.mock("@/lib/admin/job-runner", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/admin/job-runner")>("@/lib/admin/job-runner");
  return {
    JOBS: actual.JOBS,
    getJobsStatus: mockGetJobsStatus,
    embedCoverage: mockEmbedCoverage,
    startJob: mockStartJob,
  };
});

import { GET, POST } from "@/app/api/admin/jobs/route";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { logAdminAction } from "@/lib/admin/admin-audit";

const admin = { userId: 1, user: { qfId: "qf-admin" } as User };

function get() {
  return new NextRequest("http://localhost/api/admin/jobs", {
    headers: { Authorization: "Bearer t" },
  });
}
function post(body: unknown) {
  return new NextRequest("http://localhost/api/admin/jobs", {
    method: "POST",
    headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.mocked(requireAdmin).mockResolvedValue(admin);
  mockGetJobsStatus.mockClear().mockResolvedValue([]);
  mockEmbedCoverage.mockClear().mockResolvedValue({ embedded: 0, total: 0 });
  mockStartJob.mockClear().mockResolvedValue({ runId: 1 });
  vi.mocked(logAdminAction).mockClear();
});

describe("GET /api/admin/jobs", () => {
  it("returns the guard's own response for a non-admin caller", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(
      NextResponse.json({ error: "Not found" }, { status: 404 })
    );
    const res = await GET(get());
    expect(res.status).toBe(404);
  });

  it("returns job statuses and embedding coverage", async () => {
    mockGetJobsStatus.mockResolvedValue([
      {
        id: "seed-quran",
        label: "Seed Quran corpus",
        status: "never-run",
        startedAt: null,
        completedAt: null,
        error: null,
        logTail: null,
      },
    ]);
    mockEmbedCoverage.mockResolvedValue({ embedded: 6000, total: 6236 });

    const res = await GET(get());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.jobs).toHaveLength(1);
    expect(body.embedCoverage).toEqual({ embedded: 6000, total: 6236 });
  });
});

describe("POST /api/admin/jobs", () => {
  it("returns 400 for a malformed body", async () => {
    const req = new NextRequest("http://localhost/api/admin/jobs", {
      method: "POST",
      headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
      body: "not-json",
    });
    expect((await POST(req)).status).toBe(400);
  });

  it("returns 400 for an unknown job id", async () => {
    const res = await POST(post({ jobId: "bogus" }));
    expect(res.status).toBe(400);
    expect(mockStartJob).not.toHaveBeenCalled();
  });

  it("starts a valid job and logs the action", async () => {
    const res = await POST(post({ jobId: "seed-morphology" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.runId).toBe(1);
    expect(mockStartJob).toHaveBeenCalledWith("seed-morphology", "qf-admin");
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "job.start", targetId: "seed-morphology" })
    );
  });

  it("returns 400 (not 500) when startJob rejects, e.g. a job already running", async () => {
    mockStartJob.mockRejectedValue(new Error('Job "seed-quran" is already running'));
    const res = await POST(post({ jobId: "seed-quran" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/already running/);
  });
});
