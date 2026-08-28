import type { AiUsage, Provider } from "@/lib/ai/ai";

/**
 * Rough USD cost estimation for a single LLM call, used by the admin backfill
 * job's spend guard and by cost reporting over `ai_generations.tokens`.
 *
 * Rates are USD per 1M tokens, current as of 2026-08 (Anthropic first-party API
 * and Google Gemini list pricing). They are deliberately a small hand-maintained
 * table — update when pricing changes or a new model id starts appearing in
 * `ai_generations.model`. Every id an admin can pick in `lib/ai/models.ts`
 * (`SELECTABLE_MODELS`) must have an entry here, or the spend guard falls back to
 * the conservative over-estimate. An unknown model falls back to its provider's
 * most-expensive plausible rate so an estimate never silently under-reports.
 */

interface Rate {
  inputUsdPerMTok: number;
  outputUsdPerMTok: number;
}

const RATES: Record<string, Rate> = {
  // Anthropic
  "claude-fable-5": { inputUsdPerMTok: 10, outputUsdPerMTok: 50 },
  "claude-opus-4-7": { inputUsdPerMTok: 5, outputUsdPerMTok: 25 },
  "claude-opus-4-8": { inputUsdPerMTok: 5, outputUsdPerMTok: 25 },
  "claude-opus-5": { inputUsdPerMTok: 5, outputUsdPerMTok: 25 },
  "claude-sonnet-5": { inputUsdPerMTok: 2, outputUsdPerMTok: 10 },
  "claude-haiku-4-5": { inputUsdPerMTok: 1, outputUsdPerMTok: 5 },
  // Google Gemini — current 3.x tier
  "gemini-3.7-flash": { inputUsdPerMTok: 0.75, outputUsdPerMTok: 3.75 },
  "gemini-3.6-flash": { inputUsdPerMTok: 0.75, outputUsdPerMTok: 3.75 },
  "gemini-3.5-flash": { inputUsdPerMTok: 1.5, outputUsdPerMTok: 9 },
  "gemini-3.5-flash-lite": { inputUsdPerMTok: 0.3, outputUsdPerMTok: 2.5 },
  "gemini-3.1-flash-lite": { inputUsdPerMTok: 0.25, outputUsdPerMTok: 1.5 },
  // Retired, but still referenced by older `ai_generations` rows.
  "gemini-2.5-pro": { inputUsdPerMTok: 1.25, outputUsdPerMTok: 10 },
  "gemini-2.5-flash": { inputUsdPerMTok: 0.3, outputUsdPerMTok: 2.5 },
  "gemini-2.0-flash": { inputUsdPerMTok: 0.1, outputUsdPerMTok: 0.4 },
};

// Highest plausible per-provider list rate (Claude: Fable 5; Gemini: 3.5 Flash)
// so an unknown model id never makes the spend guard under-estimate.
const FALLBACK_BY_PROVIDER: Record<Provider, Rate> = {
  claude: { inputUsdPerMTok: 10, outputUsdPerMTok: 50 },
  gemini: { inputUsdPerMTok: 1.5, outputUsdPerMTok: 10 },
};

/**
 * Token counts assumed when the provider returned no usage — a connection
 * generation prompt (grounded selection over ~12 candidate verses) plus a small
 * JSON array response. Intentionally a little generous so the spend guard errs
 * toward stopping early.
 */
export const DEFAULT_TOKENS: AiUsage = { inputTokens: 1600, outputTokens: 450 };

function rateFor(model: string | null, provider: Provider): Rate {
  return (model && RATES[model]) || FALLBACK_BY_PROVIDER[provider];
}

/** Estimated USD cost of one call. Uses real usage when present, else {@link DEFAULT_TOKENS}. */
export function estimateCostUsd(
  model: string | null,
  provider: Provider,
  usage: AiUsage | null
): number {
  const { inputTokens, outputTokens } = usage ?? DEFAULT_TOKENS;
  const rate = rateFor(model, provider);
  return (
    (inputTokens / 1_000_000) * rate.inputUsdPerMTok +
    (outputTokens / 1_000_000) * rate.outputUsdPerMTok
  );
}
