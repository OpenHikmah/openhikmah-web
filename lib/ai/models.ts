import type { Provider } from "@/lib/ai/ai";

/**
 * The model ids an admin may pick per provider (the `/admin/flags` dropdowns and
 * the backfill run panel). Keep in sync with the `RATES` table in
 * `lib/ai/ai-cost.ts` — every id here needs a rate so the spend guard doesn't
 * fall back to the conservative over-estimate — and with `defaultModelFor` in
 * `lib/ai/ai.ts` when a model is retired.
 */
export const SELECTABLE_MODELS: Record<Provider, readonly string[]> = {
  claude: ["claude-opus-4-7", "claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5"],
  gemini: [
    "gemini-3.7-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
  ],
} as const;

/** The model each provider falls back to when nothing is configured. */
export const DEFAULT_MODEL: Record<Provider, string> = {
  claude: "claude-opus-4-7",
  gemini: "gemini-3.5-flash-lite",
};

export function isModelForProvider(model: string, provider: Provider): boolean {
  return SELECTABLE_MODELS[provider].includes(model);
}
