import { spawn } from "node:child_process";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/infra/db";
import { jobRuns, verses, verseEmbeddings } from "@/lib/infra/db/schema";

/**
 * Triggers and tracks the project's one-time/resumable backfill scripts
 * (scripts/seed-quran.mjs, scripts/seed-morphology.mjs, scripts/embed-corpus.mjs,
 * scripts/seed-translations.mjs)
 * from the admin panel instead of a container shell. Deliberately simple for a
 * single-box deployment: one job runs at a time, tracked by an in-memory child
 * process reference in this module (the source of truth for "is a job running
 * right now") backed by a `job_runs` DB row per invocation (the source of truth
 * for history/last-run status, so it survives a server restart).
 */

export type JobId =
  "seed-quran" | "seed-morphology" | "embed-corpus" | "seed-translations" | "backfill-connections";

export interface JobDefinition {
  id: JobId;
  label: string;
  script: string;
  requiresEnv?: string[];
  /** When set, the job accepts a params object (validated in startJob) that is
   *  passed to the spawned script as env vars. */
  acceptsParams?: boolean;
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
  {
    id: "seed-translations",
    label: "Seed verse translations (TR/RU/AZ)",
    script: "scripts/seed-translations.mjs",
  },
  {
    id: "backfill-connections",
    label: "Backfill verse connections",
    script: "scripts/backfill-connections.ts",
    acceptsParams: true,
  },
] as const;

export interface BackfillParams {
  mode: "baseline" | "topup";
  provider: "claude" | "gemini";
  /** csv subset of tr,ru,az (may be empty) */
  locales: string;
  maxCalls: number;
  maxCostUsd: number;
}

/** Validates raw admin input for the backfill job and returns the env vars the
 *  spawned script reads. Throws on bad input (routes map to 400). */
function backfillParamEnv(raw: Record<string, unknown>): Record<string, string> {
  const mode = raw.mode;
  if (mode !== "baseline" && mode !== "topup") throw new Error("mode must be baseline or topup");

  const provider = raw.provider;
  if (provider !== "claude" && provider !== "gemini") {
    throw new Error("provider must be claude or gemini");
  }

  const localeList = String(raw.locales ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (localeList.some((l) => !["tr", "ru", "az"].includes(l))) {
    throw new Error("locales must be a subset of tr,ru,az");
  }

  const maxCalls = Number(raw.maxCalls);
  if (!Number.isInteger(maxCalls) || maxCalls <= 0)
    throw new Error("maxCalls must be a positive integer");

  const maxCostUsd = Number(raw.maxCostUsd);
  if (!Number.isFinite(maxCostUsd) || maxCostUsd <= 0) {
    throw new Error("maxCostUsd must be a positive number");
  }

  const requiredKey = provider === "gemini" ? "GEMINI_API_KEY" : "ANTHROPIC_API_KEY";
  if (!process.env[requiredKey]) throw new Error(`Missing required env var: ${requiredKey}`);

  return {
    BACKFILL_MODE: mode,
    BACKFILL_PROVIDER: provider,
    BACKFILL_LOCALES: localeList.join(","),
    BACKFILL_MAX_CALLS: String(maxCalls),
    BACKFILL_MAX_COST_USD: String(maxCostUsd),
  };
}

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
 *  already-running job — routes should catch and translate to a 400/409.
 *  `params` is required for jobs with `acceptsParams` and rejected for others. */
export async function startJob(
  jobId: string,
  adminQfId: string,
  params?: Record<string, unknown>
): Promise<{ runId: number }> {
  const job = JOBS.find((j) => j.id === jobId);
  if (!job) throw new Error("Unknown job");
  if (running) throw new Error(`Job "${running.jobId}" is already running`);

  const missingEnv = (job.requiresEnv ?? []).filter((name) => !process.env[name]);
  if (missingEnv.length > 0) {
    throw new Error(`Missing required env var(s): ${missingEnv.join(", ")}`);
  }

  let paramEnv: Record<string, string> = {};
  if (job.acceptsParams) {
    if (!params) throw new Error(`Job "${job.id}" requires params`);
    if (job.id === "backfill-connections") paramEnv = backfillParamEnv(params);
  } else if (params) {
    throw new Error(`Job "${job.id}" does not accept params`);
  }

  // Claim the slot synchronously (no await between the `if (running)` check
  // above and this assignment) so two near-simultaneous calls can't both pass
  // the guard — matches lib/names/name-content.ts's inFlight/reasonInFlight
  // pattern. `runId` is filled in once the insert below resolves.
  const state: RunningJob = { jobId: job.id, runId: -1, logTail: [] };
  running = state;

  let row: { id: number };
  try {
    [row] = await db
      .insert(jobRuns)
      .values({ jobType: job.id, status: "running", triggeredBy: adminQfId })
      .returning({ id: jobRuns.id });
  } catch (err) {
    if (running === state) running = null;
    throw err;
  }
  state.runId = row.id;

  const child = spawn("bun", [job.script], {
    cwd: process.cwd(),
    env: { ...process.env, ...paramEnv },
  });

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
