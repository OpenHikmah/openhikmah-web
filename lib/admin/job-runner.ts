import { spawn } from "node:child_process";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/infra/db";
import { jobRuns, verses, verseEmbeddings } from "@/lib/infra/db/schema";
import { runConnectionBatch, type BatchOptions } from "@/lib/ai/connection-batch";
import type { Provider } from "@/lib/ai/ai";
import { SELECTABLE_MODELS, isModelForProvider } from "@/lib/ai/models";
import { LOCALES, type Locale } from "@/lib/i18n/config";

/**
 * Triggers and tracks the project's one-time/resumable backfill jobs from the
 * admin panel instead of a container shell. Deliberately simple for a single-box
 * deployment: one job runs at a time, tracked by in-memory state in this module
 * (the source of truth for "is a job running right now") backed by a `job_runs`
 * DB row per invocation (the source of truth for history/last-run status, so it
 * survives a server restart).
 *
 * Two execution shapes:
 *   - `script` jobs spawn `bun scripts/<name>.mjs` as a child process. Those
 *     scripts are deliberately dependency-light and hand-shipped in the prod
 *     image (see .dockerignore / Dockerfile).
 *   - `inProcess` jobs call an app function directly. `backfill-connections`
 *     needs a large slice of `@/lib/*` that `output: "standalone"` compiles into
 *     `.next` chunks rather than shipping as source, so a spawned
 *     `bun scripts/backfill-connections.ts` cannot resolve its imports in prod —
 *     it runs here instead.
 */

export type JobId =
  "seed-quran" | "seed-morphology" | "embed-corpus" | "seed-translations" | "backfill-connections";

export interface JobDefinition {
  id: JobId;
  label: string;
  /** Spawned as `bun <script>`. Mutually exclusive with `inProcess`. */
  script?: string;
  /** Run in-process by `startJob` instead of spawning a child. */
  inProcess?: boolean;
  requiresEnv?: string[];
  /** When set, the job accepts a params object, validated in startJob. */
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
    inProcess: true,
    acceptsParams: true,
  },
] as const;

/** Validates raw admin input for the backfill job into the typed options
 *  `runConnectionBatch` takes. Throws on bad input (routes map to 400). */
function parseBackfillParams(raw: Record<string, unknown>): BatchOptions {
  const mode = raw.mode;
  if (mode !== "baseline" && mode !== "topup") throw new Error("mode must be baseline or topup");

  const provider = raw.provider;
  if (provider !== "claude" && provider !== "gemini") {
    throw new Error("provider must be claude or gemini");
  }

  const model = raw.model === undefined || raw.model === "" ? undefined : raw.model;
  if (model !== undefined && (typeof model !== "string" || !isModelForProvider(model, provider))) {
    throw new Error(`model must be one of: ${SELECTABLE_MODELS[provider].join(", ")}`);
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
    mode,
    provider: provider as Provider,
    model: model as string | undefined,
    locales: localeList.filter((l): l is Locale => (LOCALES as readonly string[]).includes(l)),
    maxCalls,
    maxCostUsd,
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

/** Records the terminal `job_runs` row and releases the in-memory slot. Shared
 *  by the spawn path (child close/error) and the in-process path. */
function finishRun(state: RunningJob, status: "success" | "failed", error: string | null) {
  void db
    .update(jobRuns)
    .set({ status, completedAt: new Date(), error, logTail: state.logTail.join("\n") })
    .where(eq(jobRuns.id, state.runId))
    .catch((err) => console.error("job-runner: failed to record job completion", err));
  if (running?.runId === state.runId) running = null;
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

  let backfillOpts: BatchOptions | null = null;
  if (job.acceptsParams) {
    if (!params) throw new Error(`Job "${job.id}" requires params`);
    if (job.id === "backfill-connections") backfillOpts = parseBackfillParams(params);
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

  if (job.inProcess) {
    // Fire-and-forget: startJob returns as soon as the run is recorded, and the
    // batch reports progress via `onProgress` into the same logTail the status
    // endpoint reads. `runConnectionBatch` is budget-capped and single-flight,
    // and a redeploy kills it exactly like it killed the spawned child — the
    // `job_runs` row + resumable work list cover restart recovery.
    void (async () => {
      try {
        const summary = await runConnectionBatch(backfillOpts as BatchOptions, {
          onProgress: (line) => pushLogLine(state, line),
        });
        finishRun(
          state,
          summary.stoppedReason === "error" ? "failed" : "success",
          summary.error ?? null
        );
      } catch (err) {
        pushLogLine(state, `job failed: ${err instanceof Error ? err.message : String(err)}`);
        finishRun(state, "failed", err instanceof Error ? err.message : String(err));
      }
    })();
    return { runId: row.id };
  }

  const child = spawn("bun", [job.script as string], { cwd: process.cwd() });

  const onData = (chunk: Buffer) => {
    for (const line of chunk.toString("utf8").split("\n")) {
      if (line.trim()) pushLogLine(state, line);
    }
  };
  child.stdout.on("data", onData);
  child.stderr.on("data", onData);

  child.on("close", (code) => {
    finishRun(
      state,
      code === 0 ? "success" : "failed",
      code === 0 ? null : `Exited with code ${code}`
    );
  });

  child.on("error", (err) => finishRun(state, "failed", err.message));

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
