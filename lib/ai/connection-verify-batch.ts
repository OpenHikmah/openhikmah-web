import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/infra/db";
import { connections, connectionCoverage } from "@/lib/infra/db/schema";
import { resolveModel, type Provider } from "@/lib/ai/ai";
import {
  toResult,
  verifyConnections,
  VerificationBudgetExhaustedError,
} from "@/lib/ai/connection-generator";
import {
  createPacer,
  perCallCost,
  type BatchHooks,
  type StoppedReason,
} from "@/lib/ai/connection-batch";
import {
  GeminiDailyQuotaError,
  GeminiKeyInvalidError,
  GeminiRateLimitError,
} from "@/lib/ai/gemini-errors";
import { getVerses } from "@/lib/quran/quran-corpus";
import { formatProgress, getVerificationProgress } from "@/lib/ai/verification-progress";
import { incr } from "@/lib/infra/metrics";
import type { ConnectionResult, EdgeKind } from "@/types/quran";

/**
 * Re-verification backfill: runs every ACTIVE English connection that has not
 * been verified yet through `verifyConnections` (the gate new connections pass
 * at generation) and flags the ones the verifier does not explicitly approve.
 *
 * Before the verifier failed closed, connections written while it errored were
 * saved unverified and indistinguishable from verified ones; this job finds and
 * quarantines any that are wrong.
 *
 * - Work unit is a (fromRef, kind) cell, because the verifier is called per
 *   cell. A cell is on the work list while it has active `en` rows and its
 *   coverage row has no `verified_at`.
 * - A rejected, unmentioned or unverifiable row is set to `flagged` in EVERY
 *   locale (nothing cascades: a translation is served on its own), so it
 *   disappears from users at once but stays in the admin review queue
 *   (`reviewedAt` is left null) where a false positive can be restored.
 * - `verified_at` is stamped only after a COMPLETED verification, so a failed or
 *   budget-stopped cell is retried by the next run: the job is resumable and a
 *   re-run continues where it stopped. There is no key-rotation loop; when a
 *   Gemini key hits its daily quota the run ends and can be started again.
 */

const PROGRESS_EVERY = 25;
// Same reasoning as the generation batch: if the first N cells all fail and
// nothing has verified, the provider itself is down. Stop instead of draining
// the budget.
const FAIL_FAST_THRESHOLD = 5;

export interface VerifyOptions {
  provider: Provider;
  model?: string;
  maxCalls: number;
  maxCostUsd: number;
  /** Explicit Gemini API key; undefined uses `process.env.GEMINI_API_KEY`. */
  apiKey?: string;
  /** Delay between consecutive LLM requests, to stay under per-minute limits. */
  callDelayMs?: number;
}

export interface VerifySummary {
  stoppedReason: StoppedReason;
  cellsProcessed: number;
  callsUsed: number;
  costUsd: number;
  /** Cells whose verification completed (stamped `verified_at`). */
  cellsVerified: number;
  /** English connection rows set to `flagged` (their translations too, not counted). */
  rowsFlagged: number;
  cellsFailed: number;
  workListSize: number;
  error?: string;
  lastError?: string;
}

interface VerifyCell {
  fromRef: string;
  kind: EdgeKind;
}

async function buildWorkList(): Promise<VerifyCell[]> {
  const rows = await db
    .select({ fromRef: connections.fromRef, kind: connections.kind })
    .from(connections)
    .leftJoin(
      connectionCoverage,
      and(
        eq(connectionCoverage.fromRef, connections.fromRef),
        eq(connectionCoverage.kind, connections.kind),
        eq(connectionCoverage.locale, "en")
      )
    )
    .where(
      and(
        eq(connections.locale, "en"),
        eq(connections.status, "active"),
        isNull(connectionCoverage.verifiedAt)
      )
    )
    .groupBy(connections.fromRef, connections.kind)
    .orderBy(asc(connections.fromRef), asc(connections.kind));
  return rows.map((r) => ({ fromRef: r.fromRef, kind: r.kind as EdgeKind }));
}

/** Logs how much of the whole backlog is verified. A failed lookup is logged and
 *  metered but never stops the run: the progress line is informational. */
async function logProgress(hooks: BatchHooks): Promise<void> {
  try {
    hooks.onProgress(`[verify] progress: ${formatProgress(await getVerificationProgress())}`);
  } catch (err) {
    console.error("connection-verify: progress lookup failed:", err);
    incr("connection_reverify_progress_failed");
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function activeEnCount(tx: Tx | typeof db, fromRef: string, kind: EdgeKind): Promise<number> {
  const [{ count }] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(connections)
    .where(
      and(
        eq(connections.fromRef, fromRef),
        eq(connections.kind, kind),
        eq(connections.locale, "en"),
        eq(connections.status, "active")
      )
    );
  return count;
}

/** Flags the rejected pairs in every locale and stamps the cell verified, atomically. */
async function applyVerdicts(
  fromRef: string,
  kind: EdgeKind,
  rejectedToRefs: string[]
): Promise<void> {
  const now = new Date();
  await db.transaction(async (tx) => {
    if (rejectedToRefs.length > 0) {
      await tx
        .update(connections)
        .set({ status: "flagged", reviewedAt: null, reviewedBy: null })
        .where(
          and(
            eq(connections.fromRef, fromRef),
            eq(connections.kind, kind),
            inArray(connections.toRef, rejectedToRefs),
            eq(connections.status, "active")
          )
        );
    }
    const activeCount = await activeEnCount(tx, fromRef, kind);
    await tx
      .insert(connectionCoverage)
      .values({
        fromRef,
        kind,
        locale: "en",
        activeCount,
        verifiedAt: now,
        lastAttemptAt: now,
        lastError: null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [connectionCoverage.fromRef, connectionCoverage.kind, connectionCoverage.locale],
        set: {
          activeCount,
          // A flagged row frees a slot, so (like the admin review queue) the
          // cell is no longer exhausted and a top-up may fill it again.
          ...(rejectedToRefs.length > 0 ? { exhaustedAt: null } : {}),
          verifiedAt: now,
          lastAttemptAt: now,
          lastError: null,
          updatedAt: now,
        },
      });
  });
}

/** Records a failed attempt without stamping the cell, so it is retried. */
async function recordFailure(fromRef: string, kind: EdgeKind, message: string): Promise<void> {
  const now = new Date();
  const activeCount = await activeEnCount(db, fromRef, kind);
  await db
    .insert(connectionCoverage)
    .values({
      fromRef,
      kind,
      locale: "en",
      activeCount,
      lastAttemptAt: now,
      lastError: message,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [connectionCoverage.fromRef, connectionCoverage.kind, connectionCoverage.locale],
      set: { lastAttemptAt: now, lastError: message, updatedAt: now },
    });
}

export async function runVerifyBatch(
  opts: VerifyOptions,
  hooks: BatchHooks,
  signal?: AbortSignal
): Promise<VerifySummary> {
  const summary: VerifySummary = {
    stoppedReason: "completed",
    cellsProcessed: 0,
    callsUsed: 0,
    costUsd: 0,
    cellsVerified: 0,
    rowsFlagged: 0,
    cellsFailed: 0,
    workListSize: 0,
  };

  const model = await resolveModel("connections", opts.provider, opts.model);

  let cells: VerifyCell[];
  try {
    cells = await buildWorkList();
  } catch (err) {
    summary.stoppedReason = "error";
    summary.error = err instanceof Error ? err.message : String(err);
    hooks.onProgress(`[verify] failed to build work list: ${summary.error}`);
    return summary;
  }
  summary.workListSize = cells.length;
  hooks.onProgress(
    `[verify] ${cells.length} cells to verify | provider=${opts.provider} | model=${model} | ` +
      `maxCalls=${opts.maxCalls} | maxCost=$${opts.maxCostUsd}`
  );
  await logProgress(hooks);

  const callCost = perCallCost(opts.provider, model);
  const budget: { spend: () => boolean; stoppedReason: StoppedReason | null } = {
    stoppedReason: null,
    spend() {
      if (summary.callsUsed + 1 > opts.maxCalls) {
        this.stoppedReason = "call-budget";
        return false;
      }
      if (summary.costUsd + callCost > opts.maxCostUsd) {
        this.stoppedReason = "cost-budget";
        return false;
      }
      summary.callsUsed++;
      summary.costUsd += callCost;
      return true;
    },
  };
  const pacer = createPacer(opts.callDelayMs, signal);
  let consecutiveFailures = 0;

  for (const cell of cells) {
    if (signal?.aborted) {
      summary.stoppedReason = "cancelled";
      break;
    }
    if (summary.callsUsed + 1 > opts.maxCalls) {
      summary.stoppedReason = "call-budget";
      break;
    }
    if (summary.costUsd + callCost > opts.maxCostUsd) {
      summary.stoppedReason = "cost-budget";
      break;
    }

    try {
      const rows = await db
        .select({
          toRef: connections.toRef,
          reason: connections.reason,
          confidence: connections.confidence,
        })
        .from(connections)
        .where(
          and(
            eq(connections.fromRef, cell.fromRef),
            eq(connections.kind, cell.kind),
            eq(connections.locale, "en"),
            eq(connections.status, "active")
          )
        )
        .orderBy(asc(connections.toRef));

      const verses = await getVerses([cell.fromRef, ...rows.map((r) => r.toRef)]);
      const source = verses.get(cell.fromRef);
      if (!source) throw new Error(`source verse ${cell.fromRef} is not in the corpus`);

      // A target missing from the corpus cannot be shown to the verifier, and an
      // unverifiable connection is not an approved one: it is flagged.
      const candidates: ConnectionResult[] = [];
      const unverifiable: string[] = [];
      for (const row of rows) {
        const target = verses.get(row.toRef);
        if (!target) unverifiable.push(row.toRef);
        else candidates.push(toResult(target, row.reason, cell.kind, row.confidence ?? undefined));
      }

      const approved = await verifyConnections(
        cell.fromRef,
        source.arabicText,
        source.translation,
        cell.kind,
        candidates,
        {
          provider: opts.provider,
          model,
          apiKey: opts.apiKey,
          signal,
          spendBudget: () => budget.spend(),
          pacer,
        }
      );
      const approvedRefs = new Set(approved.map((c) => c.ref));
      const rejected = [
        ...unverifiable,
        ...candidates.filter((c) => !approvedRefs.has(c.ref)).map((c) => c.ref),
      ];

      await applyVerdicts(cell.fromRef, cell.kind, rejected);
      consecutiveFailures = 0;
      summary.cellsVerified++;
      summary.rowsFlagged += rejected.length;
      if (rejected.length > 0) {
        incr("connection_reverify_flagged", rejected.length);
        hooks.onProgress(
          `[verify] ${cell.fromRef} ${cell.kind}: flagged ${rejected.join(", ")} for review`
        );
      }
    } catch (err) {
      if (signal?.aborted || (err instanceof Error && err.name === "AbortError")) {
        summary.stoppedReason = "cancelled";
        break;
      }
      if (err instanceof VerificationBudgetExhaustedError) {
        summary.stoppedReason = budget.stoppedReason ?? "call-budget";
        hooks.onProgress(
          `[verify] budget exhausted before verifying ${cell.fromRef} ${cell.kind}, nothing changed for it, stopping`
        );
        break;
      }
      if (err instanceof GeminiDailyQuotaError) {
        summary.stoppedReason = "quota-daily";
        summary.lastError = err.message;
        hooks.onProgress("[verify] daily quota exhausted for the active key, ending the run");
        break;
      }
      if (err instanceof GeminiKeyInvalidError) {
        summary.stoppedReason = "key-invalid";
        summary.lastError = err.message;
        hooks.onProgress("[verify] active key invalid or blocked, ending the run");
        break;
      }
      if (err instanceof GeminiRateLimitError) {
        summary.stoppedReason = "rate-limited";
        summary.lastError = err.message;
        hooks.onProgress("[verify] active key rate-limited, ending the run");
        break;
      }
      const message = err instanceof Error ? err.message : String(err);
      console.error(`connection-verify: cell ${cell.fromRef} ${cell.kind} failed:`, err);
      incr("connection_reverify_cell_failed");
      summary.cellsFailed++;
      summary.lastError = message;
      consecutiveFailures++;
      hooks.onProgress(`[verify] cell ${cell.fromRef} ${cell.kind} FAILED: ${message}`);
      await recordFailure(cell.fromRef, cell.kind, message).catch((recordErr) => {
        console.error("connection-verify: recording the failure failed:", recordErr);
        incr("connection_reverify_record_failed");
      });
      if (summary.cellsVerified === 0 && consecutiveFailures >= FAIL_FAST_THRESHOLD) {
        summary.stoppedReason = "error";
        summary.error = `aborted after ${consecutiveFailures} consecutive cell failures with nothing verified, the provider is likely down. Last error: ${message}`;
        hooks.onProgress(`[verify] ${summary.error}`);
        summary.cellsProcessed++;
        break;
      }
    }

    summary.cellsProcessed++;
    if (summary.cellsProcessed % PROGRESS_EVERY === 0) {
      hooks.onProgress(
        `[verify] ${summary.cellsProcessed}/${cells.length} cells | ${summary.callsUsed} calls | ` +
          `$${summary.costUsd.toFixed(2)} | verified=${summary.cellsVerified} ` +
          `flagged=${summary.rowsFlagged} fail=${summary.cellsFailed}`
      );
      await logProgress(hooks);
    }
  }

  // Every cell failed: not a green "nothing to do" pass.
  if (
    summary.stoppedReason === "completed" &&
    summary.cellsVerified === 0 &&
    summary.cellsFailed > 0
  ) {
    summary.stoppedReason = "error";
    summary.error = `${summary.cellsFailed}/${summary.cellsProcessed} cells failed, 0 verified, last error: ${summary.lastError}`;
  }

  await logProgress(hooks);
  hooks.onProgress(
    `[verify] DONE (${summary.stoppedReason}) | ${summary.cellsProcessed} cells | ` +
      `${summary.callsUsed} calls | $${summary.costUsd.toFixed(2)} | verified=${summary.cellsVerified} ` +
      `flagged=${summary.rowsFlagged} fail=${summary.cellsFailed}`
  );
  return summary;
}
