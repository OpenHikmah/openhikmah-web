import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, rateLimitAdminMutation } from "@/lib/admin/admin-auth";
import { logAdminAction } from "@/lib/admin/admin-audit";
import { JOBS, getJobsStatus, embedCoverage, startJob } from "@/lib/admin/job-runner";

/** Job list + latest run status, plus the embedding-coverage check. */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const [jobs, coverage] = await Promise.all([getJobsStatus(), embedCoverage()]);
    return NextResponse.json({ jobs, embedCoverage: coverage });
  } catch (err) {
    console.error("admin jobs GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** Trigger a backfill job: body `{ jobId }`. */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const limited = await rateLimitAdminMutation(auth);
  if (limited) return limited;

  let body: { jobId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const jobId = body.jobId;
  if (!jobId || !JOBS.some((j) => j.id === jobId)) {
    return NextResponse.json({ error: "Unknown job" }, { status: 400 });
  }

  try {
    const { runId } = await startJob(jobId, auth.user.qfId);
    await logAdminAction({
      adminQfId: auth.user.qfId,
      action: "job.start",
      targetType: "job",
      targetId: jobId,
      meta: { runId },
    });
    return NextResponse.json({ runId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to start job";
    // Already-running / missing-env are expected client errors, not server faults.
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
