import postgres from "postgres";

/**
 * Cross-process mutual exclusion for the admin job runner.
 *
 * `job-runner.ts` guards "one job at a time" with a module-level `running`
 * variable. That is process-local: run the app with more than one Node process
 * and two near-simultaneous `startJob` calls can each pass that guard, insert
 * their own `job_runs` row, and spawn duplicate work — for `backfill-connections`
 * that is duplicated per-call LLM spend. A Postgres session-level advisory lock
 * closes the gap: only one process can hold {@link JOB_LOCK_KEY} at a time.
 *
 * The lock lives on a dedicated connection kept open for the whole job lifetime
 * (hours, in loop mode) — deliberately NOT one of the shared pool's ten slots.
 * If the process dies the session drops and Postgres releases the lock on its
 * own, which is exactly right: a crashed process must not wedge the runner.
 */

// Arbitrary but fixed — the single global "one job slot". Fits int4 and is
// passed via pg_advisory_lock's single-argument (bigint) form. Unrelated to any
// table id.
export const JOB_LOCK_KEY = 776142517;

// Own connection, never pool-shared. `idle_timeout` and `max_lifetime` are
// disabled so the connection — and therefore the session-scoped lock — is never
// recycled out from under a running job.
const lockClient = postgres(
  process.env.DATABASE_URL ?? "postgresql://openh:placeholder@localhost:5432/open_hikmah",
  { max: 1, idle_timeout: 0, max_lifetime: null, connect_timeout: 10 }
);

/**
 * Tries to take the global job lock without blocking. `true` means this process
 * now holds it and must call {@link releaseJobLock} when the job ends; `false`
 * means another process holds it and the caller must refuse to start.
 */
export async function tryAcquireJobLock(): Promise<boolean> {
  const [{ locked }] = await lockClient<{ locked: boolean }[]>`
    select pg_try_advisory_lock(${JOB_LOCK_KEY}) as locked
  `;
  return locked;
}

/**
 * Releases the global job lock. Best-effort: a failure here (e.g. the dedicated
 * connection dropped) is logged, not thrown — a dropped session has already
 * released the lock server-side, and the caller is on a terminal path anyway.
 */
export async function releaseJobLock(): Promise<void> {
  try {
    await lockClient`select pg_advisory_unlock(${JOB_LOCK_KEY})`;
  } catch (err) {
    console.error("job-lock: failed to release advisory lock", err);
  }
}
