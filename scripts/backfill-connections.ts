/**
 * Local-dev / smoke-test entry point for the connection backfill.
 *
 * The admin panel does NOT run this script — `/admin/coverage` → job-runner
 * calls `runConnectionBatch` in-process (this file's `@/lib/*` import graph is a
 * large slice of the app that `output: "standalone"` compiles into `.next`
 * chunks, so a spawned `bun scripts/backfill-connections.ts` can't resolve its
 * imports in the prod image). This wrapper stays for `bun run backfill:connections`
 * against a local checkout:
 *
 *   BACKFILL_MODE=baseline BACKFILL_PROVIDER=claude BACKFILL_LOCALES= \
 *   BACKFILL_MAX_CALLS=3 BACKFILL_MAX_COST_USD=1 DATABASE_URL=... \
 *   bun scripts/backfill-connections.ts
 *
 *   BACKFILL_MODE         baseline | topup
 *   BACKFILL_PROVIDER     claude | gemini
 *   BACKFILL_LOCALES      csv subset of tr,ru,az (may be empty)
 *   BACKFILL_MAX_CALLS    hard ceiling on LLM calls (exact)
 *   BACKFILL_MAX_COST_USD best-effort USD ceiling
 *   BACKFILL_MODEL        optional model id (must match BACKFILL_PROVIDER)
 */
import { runConnectionBatch, type BatchMode } from "@/lib/ai/connection-batch";
import type { Provider } from "@/lib/ai/ai";
import { SELECTABLE_MODELS, isModelForProvider } from "@/lib/ai/models";
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

// Same provider→key rule as lib/admin/job-runner.ts's parseBackfillParams: a direct
// run must not start (and bill nothing) if the selected provider's key is unset.
const requiredKey = provider === "gemini" ? "GEMINI_API_KEY" : "ANTHROPIC_API_KEY";
if (!process.env[requiredKey]) {
  console.error(`backfill-connections: ${requiredKey} is required for provider "${provider}"`);
  process.exit(1);
}

const TARGET_LOCALES = ["tr", "ru", "az"] as const;
const localeInput = (process.env.BACKFILL_LOCALES ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
// Reject an unknown locale rather than silently dropping it — a direct
// invocation should never complete an expensive partial run while the operator
// believes a locale they mistyped was included.
const badLocale = localeInput.find((l) => !(TARGET_LOCALES as readonly string[]).includes(l));
if (badLocale) {
  console.error(
    `backfill-connections: BACKFILL_LOCALES must be a subset of ${TARGET_LOCALES.join(",")}, got "${badLocale}"`
  );
  process.exit(1);
}
const locales = localeInput.filter(
  (l): l is Locale => (LOCALES as readonly string[]).includes(l) && l !== "en"
);

const model = process.env.BACKFILL_MODEL || undefined;
if (model !== undefined && !isModelForProvider(model, provider)) {
  console.error(
    `backfill-connections: BACKFILL_MODEL "${model}" is not valid for ${provider} — one of: ${SELECTABLE_MODELS[provider].join(", ")}`
  );
  process.exit(1);
}

const maxCalls = Number(requireEnv("BACKFILL_MAX_CALLS"));
const maxCostUsd = Number(requireEnv("BACKFILL_MAX_COST_USD"));
if (
  !Number.isInteger(maxCalls) ||
  maxCalls <= 0 ||
  !Number.isFinite(maxCostUsd) ||
  maxCostUsd <= 0
) {
  console.error(
    "backfill-connections: BACKFILL_MAX_CALLS must be a positive integer and BACKFILL_MAX_COST_USD a positive number"
  );
  process.exit(1);
}

const summary = await runConnectionBatch(
  {
    mode: mode as BatchMode,
    provider: provider as Provider,
    model,
    locales,
    maxCalls,
    maxCostUsd,
  },
  // console.error keeps progress on stderr — the repo's precommit guard forbids
  // console.log in .ts files, and a dev smoke-test doesn't need stdout.
  { onProgress: (line) => console.error(line) }
);

console.error(`backfill-connections: ${JSON.stringify(summary)}`);
process.exit(summary.stoppedReason === "error" ? 1 : 0);
