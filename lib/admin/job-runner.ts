import { spawn } from "node:child_process";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/infra/db";
import { jobRuns, verses, verseEmbeddings } from "@/lib/infra/db/schema";
import {
  runConnectionBatch,
  type BatchOptions,
  type StoppedReason,
} from "@/lib/ai/connection-batch";
import {
  runConnectionBatchLoop,
  type LoopOptions,
  type LoopStoppedReason,
} from "@/lib/ai/connection-batch-loop";
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

/** Env var names holding the free-tier Gemini keys the backfill "loop mode"
 *  rotates through. Order here is the rotation order. */
export const GEMINI_KEY_POOL = [
  "GEMINI_API1",
  "GEMINI_API2",
  "GEMINI_API3",
  "GEMINI_API4",
  "GEMINI_API5",
] as const;

/** The subset of `GEMINI_KEY_POOL` whose env var is actually set. Names only —
 *  never values. The coverage form fetches this to build its key picker. */
export function configuredGeminiKeys(): string[] {
  return GEMINI_KEY_POOL.filter((name) => !!process.env[name]);
}

const MAX_CALL_DELAY_MS = 60_000;
const DEFAULT_CALL_DELAY_MS = 1500;

export type ParsedBackfill =
  { kind: "single"; opts: BatchOptions } | { kind: "loop"; opts: LoopOptions };

/** Validates raw admin input for the backfill job. Returns either the one-pass
 *  options `runConnectionBatch` takes, or — when `raw.loop` is set — the
 *  key-rotating options `runConnectionBatchLoop` takes. Throws on bad input
 *  (routes map to 400). */
function parseBackfillParams(raw: Record<string, unknown>): ParsedBackfill {
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
  const locales = localeList.filter((l): l is Locale => (LOCALES as readonly string[]).includes(l));

  if (raw.loop) {
    if (provider !== "gemini") {
      throw new Error("loop mode requires provider=gemini (Claude has no free tier)");
    }

    const rawKeys = Array.isArray(raw.keys) ? raw.keys : [];
    const poolOrder = GEMINI_KEY_POOL as readonly string[];
    const keyLabels = poolOrder.filter(
      (name) => rawKeys.includes(name) // dedupe + pool order in one pass
    );
    const unknown = rawKeys.filter((k) => typeof k !== "string" || !poolOrder.includes(k));
    if (unknown.length > 0) throw new Error(`unknown key name(s): ${unknown.join(", ")}`);
    if (keyLabels.length === 0) throw new Error("loop mode requires at least one Gemini key");
    const missing = keyLabels.filter((name) => !process.env[name]);
    if (missing.length > 0) {
      throw new Error(`keys not configured in env: ${missing.join(", ")}`);
    }

    let callDelayMs = DEFAULT_CALL_DELAY_MS;
    if (raw.callDelayMs !== undefined && raw.callDelayMs !== "") {
      callDelayMs = Number(raw.callDelayMs);
      if (!Number.isInteger(callDelayMs) || callDelayMs < 0 || callDelayMs > MAX_CALL_DELAY_MS) {
        throw new Error(`callDelayMs must be an integer between 0 and ${MAX_CALL_DELAY_MS}`);
      }
    }

    return {
      kind: "loop",
      opts: {
        mode,
        model: model as string | undefined,
        locales,
        apiKeys: keyLabels.map((name) => process.env[name] as string),
        apiKeyLabels: keyLabels,
        callDelayMs,
        maxCalls: optionalPositiveInt(raw.maxCalls, "maxCalls"),
        maxCostUsd: optionalPositiveNumber(raw.maxCostUsd, "maxCostUsd"),
      },
    };
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
    kind: "single",
    opts: {
      mode,
      provider: provider as Provider,
      model: model as string | undefined,
      locales,
      maxCalls,
      maxCostUsd,
    },
  };
}

/** A blank optional ceiling means "no cap" — `Number.POSITIVE_INFINITY`, which
 *  the batch's `+1 > max` / `+cost > max` guards treat as always-allowed. */
function optionalPositiveInt(value: unknown, name: string): number {
  if (value === undefined || value === "" || value === null) return Number.POSITIVE_INFINITY;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${name} must be a positive integer`);
  return n;
}

function optionalPositiveNumber(value: unknown, name: string): number {
  if (value === undefined || value === "" || value === null) return Number.POSITIVE_INFINITY;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${name} must be a positive number`);
  return n;
}

// 100, not 50: a loop run's per-key rotation lines need to stay visible on the
// Jobs page alongside the inner batch's periodic progress lines.
const LOG_TAIL_LINES = 100;

interface RunningJob {
  jobId: JobDefinition["id"];
  runId: number;
  logTail: string[];
  /** Aborted by `stopJob`. Only the in-process backfill job watches it. */
  controller: AbortController;
}

// Module-level, so it survives across requests within this `next start`
// process but not across restarts (the DB row is what persists that).
let running: RunningJob | null = null;

export function currentlyRunningJobId(): JobDefinition["id"] | null {
  return running?.jobId ?? null;
}

/** Cooperatively stops the running job. Only `inProcess` jobs (currently just
 *  `backfill-connections`) watch the abort signal; the batch loop checks it
 *  between cells and records a `cancelled` run via `finishRun`. Throws when
 *  nothing is running or the running job can't be stopped — routes map to 400. */
export function stopJob(adminQfId: string): { jobId: JobDefinition["id"] } {
  const job = running;
  if (!job) throw new Error("No job is running");
  const def = JOBS.find((j) => j.id === job.jobId);
  if (!def?.inProcess) throw new Error(`Job "${job.jobId}" can't be stopped`);
  job.controller.abort();
  pushLogLine(job, `stop requested by admin ${adminQfId}`);
  return { jobId: job.jobId };
}

function pushLogLine(job: RunningJob, line: string) {
  job.logTail.push(line);
  if (job.logTail.length > LOG_TAIL_LINES) job.logTail.shift();
}

/** Records the terminal `job_runs` row and releases the in-memory slot. Shared
 *  by the spawn path (child close/error) and the in-process path. */
function finishRun(
  state: RunningJob,
  status: "success" | "failed" | "cancelled",
  error: string | null
) {
  void db
    .update(jobRuns)
    .set({ status, completedAt: new Date(), error, logTail: state.logTail.join("\n") })
    .where(eq(jobRuns.id, state.runId))
    .catch((err) => console.error("job-runner: failed to record job completion", err));
  if (running?.runId === state.runId) running = null;
}

/** Maps a batch / loop terminal reason to the `job_runs.status` the Jobs page
 *  renders. "All selected keys hit their daily quota" and "work list fully
 *  covered" are the loop's *designed* clean endings — `success`, with the log
 *  tail explaining which. Only a genuine fault is `failed`. */
function mapTerminalStatus(
  reason: StoppedReason | LoopStoppedReason
): "success" | "failed" | "cancelled" {
  if (reason === "cancelled") return "cancelled";
  if (reason === "error" || reason === "quota-daily") return "failed";
  return "success";
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

  let backfill: ParsedBackfill | null = null;
  if (job.acceptsParams) {
    if (!params) throw new Error(`Job "${job.id}" requires params`);
    if (job.id === "backfill-connections") backfill = parseBackfillParams(params);
  } else if (params) {
    throw new Error(`Job "${job.id}" does not accept params`);
  }

  // Claim the slot synchronously (no await between the `if (running)` check
  // above and this assignment) so two near-simultaneous calls can't both pass
  // the guard — matches lib/names/name-content.ts's inFlight/reasonInFlight
  // pattern. `runId` is filled in once the insert below resolves.
  const state: RunningJob = {
    jobId: job.id,
    runId: -1,
    logTail: [],
    controller: new AbortController(),
  };
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
    const parsed = backfill as ParsedBackfill;
    void (async () => {
      try {
        const hooks = { onProgress: (line: string) => pushLogLine(state, line) };
        const summary =
          parsed.kind === "loop"
            ? await runConnectionBatchLoop(parsed.opts, hooks, state.controller.signal)
            : await runConnectionBatch(parsed.opts, hooks, state.controller.signal);
        finishRun(state, mapTerminalStatus(summary.stoppedReason), summary.error ?? null);
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
  status: "never-run" | "running" | "success" | "failed" | "cancelled";
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
