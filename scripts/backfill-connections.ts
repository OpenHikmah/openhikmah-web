/**
 * Admin backfill job: fill the connection graph so the public "+" expander
 * never shows "Could not find connections".
 *
 * Triggered from /admin/coverage via lib/admin/job-runner.ts, which spawns
 * `bun scripts/backfill-connections.ts` with these env vars:
 *
 *   BACKFILL_MODE         baseline | topup
 *   BACKFILL_PROVIDER     claude | gemini
 *   BACKFILL_LOCALES      csv subset of tr,ru,az (may be empty)
 *   BACKFILL_MAX_CALLS    hard ceiling on LLM calls (exact)
 *   BACKFILL_MAX_COST_USD best-effort USD ceiling
 *
 * Can also be run directly for a smoke test:
 *   BACKFILL_MODE=baseline BACKFILL_PROVIDER=claude BACKFILL_LOCALES= \
 *   BACKFILL_MAX_CALLS=3 BACKFILL_MAX_COST_USD=1 DATABASE_URL=... \
 *   bun scripts/backfill-connections.ts
 */
import { runConnectionBatch, type BatchMode } from "@/lib/ai/connection-batch";
import type { Provider } from "@/lib/ai/ai";
import { LOCALES, type Locale } from "@/lib/i18n/config";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined) {
    console.error(`backfill-connections: ${name} is not set`);
    process.exit(1);
  }
  return value;
}

const mode = requireEnv("BACKFILL_MODE");
if (mode !== "baseline" && mode !== "topup") {
  console.error(`backfill-connections: BACKFILL_MODE must be baseline|topup, got "${mode}"`);
  process.exit(1);
}

const provider = requireEnv("BACKFILL_PROVIDER");
if (provider !== "claude" && provider !== "gemini") {
  console.error(`backfill-connections: BACKFILL_PROVIDER must be claude|gemini, got "${provider}"`);
  process.exit(1);
}

const locales = (process.env.BACKFILL_LOCALES ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .filter((l): l is Locale => (LOCALES as readonly string[]).includes(l) && l !== "en");

const maxCalls = Number(requireEnv("BACKFILL_MAX_CALLS"));
const maxCostUsd = Number(requireEnv("BACKFILL_MAX_COST_USD"));
if (
  !Number.isFinite(maxCalls) ||
  maxCalls <= 0 ||
  !Number.isFinite(maxCostUsd) ||
  maxCostUsd <= 0
) {
  console.error(
    "backfill-connections: BACKFILL_MAX_CALLS / BACKFILL_MAX_COST_USD must be positive"
  );
  process.exit(1);
}

const summary = await runConnectionBatch(
  {
    mode: mode as BatchMode,
    provider: provider as Provider,
    locales,
    maxCalls,
    maxCostUsd,
  },
  { onProgress: (line) => console.log(line) }
);

console.log(`backfill-connections: ${JSON.stringify(summary)}`);
process.exit(summary.stoppedReason === "error" ? 1 : 0);
