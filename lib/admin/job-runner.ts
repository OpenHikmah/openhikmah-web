import { spawn } from "node:child_process";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/infra/db";
import { jobRuns, verses, verseEmbeddings } from "@/lib/infra/db/schema";

/**
 * Triggers and tracks the project's one-time/resumable backfill scripts
 * (scripts/seed-quran.mjs, scripts/seed-morphology.mjs, scripts/embed-corpus.mjs)
 * from the admin panel instead of a container shell. Deliberately simple for a
 * single-box deployment: one job runs at a time, tracked by an in-memory child
 * process reference in this module (the source of truth for "is a job running
 * right now") backed by a `job_runs` DB row per invocation (the source of truth
 * for history/last-run status, so it survives a server restart).
 */

export interface JobDefinition {
  id: "seed-quran" | "seed-morphology" | "embed-corpus";
  label: string;
  script: string;
  requiresEnv?: string[];
}

export const JOBS: readonly JobDefinition[] = [
  { id: "seed-quran", label: "Seed Quran corpus", script: "scripts/seed-quran.mjs" },
  {
    id: "seed-morphology",
    label: "Seed word morphology",
    script: "scripts/seed-morphology.mjs",
  },
  {
    id: "embed-corpus",
    label: "Generate verse embeddings",
    script: "scripts/embed-corpus.mjs",
    requiresEnv: ["GEMINI_API_KEY"],
  },
] as const;

const LOG_TAIL_LINES = 50;

interface RunningJob {
  jobId: JobDefinition["id"];
  runId: number;
  logTail: string[];
}

// Module-level, so it survives across requests within this `next start`
// process but not across restarts (the DB row is what persists that).
let running: RunningJob | null = null;

export function currentlyRunningJobId(): JobDefinition["id"] | null {
  return running?.jobId ?? null;
}

function pushLogLine(job: RunningJob, line: string) {
  job.logTail.push(line);
  if (job.logTail.length > LOG_TAIL_LINES) job.logTail.shift();
}

/** Starts a job if none is currently running. Throws on bad input or an
 *  already-running job — routes should catch and translate to a 400/409. */
export async function startJob(jobId: string, adminQfId: string): Promise<{ runId: number }> {
  const job = JOBS.find((j) => j.id === jobId);
  if (!job) throw new Error("Unknown job");
  if (running) throw new Error(`Job "${running.jobId}" is already running`);

  const missingEnv = (job.requiresEnv ?? []).filter((name) => !process.env[name]);
  if (missingEnv.length > 0) {
    throw new Error(`Missing required env var(s): ${missingEnv.join(", ")}`);
  }

  const [row] = await db
    .insert(jobRuns)
    .values({ jobType: job.id, status: "running", triggeredBy: adminQfId })
    .returning({ id: jobRuns.id });

  const state: RunningJob = { jobId: job.id, runId: row.id, logTail: [] };
  running = state;

  const child = spawn("bun", [job.script], { cwd: process.cwd(), env: process.env });

  const onData = (chunk: Buffer) => {
    for (const line of chunk.toString("utf8").split("\n")) {
      if (line.trim()) pushLogLine(state, line);
    }
  };
  child.stdout.on("data", onData);
  child.stderr.on("data", onData);

  child.on("close", (code) => {
    void db
      .update(jobRuns)
      .set({
        status: code === 0 ? "success" : "failed",
        completedAt: new Date(),
        error: code === 0 ? null : `Exited with code ${code}`,
        logTail: state.logTail.join("\n"),
      })
      .where(eq(jobRuns.id, state.runId))
      .catch((err) => console.error("job-runner: failed to record job completion", err));
    if (running?.runId === state.runId) running = null;
  });

  child.on("error", (err) => {
    void db
      .update(jobRuns)
      .set({
        status: "failed",
        completedAt: new Date(),
        error: err.message,
        logTail: state.logTail.join("\n"),
      })
      .where(eq(jobRuns.id, state.runId))
      .catch((e) => console.error("job-runner: failed to record job spawn error", e));
    if (running?.runId === state.runId) running = null;
  });

  return { runId: row.id };
}

export interface JobStatus {
  id: JobDefinition["id"];
  label: string;
  status: "never-run" | "running" | "success" | "failed";
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  logTail: string | null;
}

/** Latest run per registered job, merged with the live log tail if it's the
 *  one currently in flight. */
export async function getJobsStatus(): Promise<JobStatus[]> {
  return Promise.all(
    JOBS.map(async (job): Promise<JobStatus> => {
      const [latest] = await db
        .select()
        .from(jobRuns)
        .where(eq(jobRuns.jobType, job.id))
        .orderBy(desc(jobRuns.startedAt))
        .limit(1);

      const live = running?.jobId === job.id ? running : null;

      if (!latest) {
        return {
          id: job.id,
          label: job.label,
          status: "never-run",
          startedAt: null,
          completedAt: null,
          error: null,
          logTail: live ? live.logTail.join("\n") : null,
        };
      }

      return {
        id: job.id,
        label: job.label,
        status: latest.status as JobStatus["status"],
        startedAt: latest.startedAt.toISOString(),
        completedAt: latest.completedAt?.toISOString() ?? null,
        error: latest.error,
        logTail: live ? live.logTail.join("\n") : latest.logTail,
      };
    })
  );
}

/** Live coverage check: how many verses have an embedding vs. the full corpus —
 *  the "verify embeddings cover all 6,236 verses" check from issue #114,
 *  surfaced directly in the panel instead of a manual DB query. */
export async function embedCoverage(): Promise<{ embedded: number; total: number }> {
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(verses);
  const [{ embedded }] = await db
    .select({ embedded: sql<number>`count(*)::int` })
    .from(verseEmbeddings);
  return { embedded, total };
}
