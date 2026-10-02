import { callAI, type CallAiOptions } from "@/lib/ai/ai";
import { looksLikeRefusal } from "@/lib/ai/refusal";
import { TANZIH_CONSTRAINT, containsTashbih } from "@/lib/ai/theological-constraints";
import { incr } from "@/lib/infra/metrics";
import {
  GeminiDailyQuotaError,
  GeminiKeyInvalidError,
  GeminiRateLimitError,
} from "@/lib/ai/gemini-errors";

/**
 * A translated reason that fails one of these checks is junk, not localized
 * theology — it must never be persisted as canonical. Thresholds are
 * deliberately loose: a real translation of a one-sentence reason stays well
 * inside them, so a rejection means the model returned a refusal, a label
 * wrapper, an English echo, or nonsense.
 *
 * The length-ratio floor assumes the target script is roughly comparable in
 * character count to English (true for the shipped locales tr/ru/az). A
 * compact-script locale (CJK, unvowelled Arabic) would need this revisited.
 */
const MAX_LENGTH_RATIO = 3;
const MIN_LENGTH_RATIO = 0.35;
const MIN_SOURCE_LEN_FOR_MIN_RATIO = 25;

/** Leading "Sure! Here is the translation:" / "Translation:" / "Turkish
 *  translation:" wrappers the model is told not to add but sometimes does. Only
 *  a single recognized label at the very start is stripped; `[^:]*` stops at the
 *  first colon so real sentence content is never swallowed. */
const LABEL_PREFIX =
  /^\s*(?:sure[,!.]?\s+)?(?:here(?:['’]s| is)[^:]*:|(?:[a-z]+ )?translation:|translated(?: sentence| text| (?:in)?to [a-z]+)?:)\s*/i;

export type TranslationRejection =
  | "label_prefix"
  | "refusal"
  | "tashbih"
  | "english_echo"
  | "length_ratio"
  | "meaning_drift"
  | "verification_failed";

export type TranslationVerdict =
  { ok: true; text: string } | { ok: false; reason: TranslationRejection };

/** Case- and punctuation-insensitive form, so an echo that only re-punctuates or
 *  re-cases the English source is still caught. */
function normalizeForEcho(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Validates a non-empty model translation of `source` before it can be cached
 * as canonical localized theology. Strips a leading label wrapper if present,
 * then rejects refusals, English echoes, and wild length mismatches.
 *
 * `looksLikeRefusal` is English-anchored, so a refusal phrased in the target
 * language is not caught here — the english-echo and length-ratio checks are the
 * backstop for that case, and native-language refusal screening is a follow-up.
 *
 * `maxLengthRatio` overrides {@link MAX_LENGTH_RATIO} for sources this check
 * wasn't calibrated for — a short noun-phrase epithet (e.g. a divine name's
 * "meaning", "The Sovereign") can legitimately expand far more than 3x when
 * rendered as a single word/compound in tr/ru/az, where the default ratio
 * would reject a perfectly good translation as junk. The min-ratio floor is
 * unaffected (it already only applies at `MIN_SOURCE_LEN_FOR_MIN_RATIO`+ chars,
 * so it never engages for these short sources).
 */
export function validateTranslation(
  source: string,
  translated: string,
  opts: { maxLengthRatio?: number } = {}
): TranslationVerdict {
  const hadLabel = LABEL_PREFIX.test(translated);
  const stripped = translated.replace(LABEL_PREFIX, "").trim();

  if (stripped === "") return { ok: false, reason: "label_prefix" };
  if (looksLikeRefusal(stripped)) return { ok: false, reason: "refusal" };
  // English-only patterns (see containsTashbih) — this catches English leaking
  // into the output, not a violation phrased in the target language.
  if (containsTashbih(stripped)) return { ok: false, reason: "tashbih" };

  const src = source.trim();
  if (normalizeForEcho(stripped) === normalizeForEcho(src)) {
    // translateReason is only ever called cross-language, so an echo of the
    // English source is always a failed translation.
    return { ok: false, reason: "english_echo" };
  }

  const maxLengthRatio = opts.maxLengthRatio ?? MAX_LENGTH_RATIO;
  const ratio = stripped.length / Math.max(src.length, 1);
  if (
    ratio > maxLengthRatio ||
    (src.length >= MIN_SOURCE_LEN_FOR_MIN_RATIO && ratio < MIN_LENGTH_RATIO)
  ) {
    return { ok: false, reason: "length_ratio" };
  }

  return { ok: true, text: hadLabel ? stripped : translated };
}

/**
 * The batch job's call budget has no room for the meaning check's calls, and a
 * translation is never persisted unverified, so it is abandoned (nothing saved)
 * and retried by a later run. The batch treats this as a clean budget stop.
 */
export class TranslationBudgetExhaustedError extends Error {
  constructor() {
    super("translation meaning check skipped: call budget exhausted");
    this.name = "TranslationBudgetExhaustedError";
  }
}

/** Budget guard and pacer for the meaning check's extra calls (batch jobs only). */
export interface TranslationVerifyHooks {
  spendBudget?: () => boolean;
  pacer?: { waitTurn: () => Promise<void>; noteRequest: () => void };
}

const BACK_TRANSLATE_PROMPT = (translated: string, language: string) =>
  `Render the following ${language} sentence in English. Translate it as literally and completely as you can, adding nothing and leaving nothing out. Return ONLY the English sentence, with no quotation marks, labels, or explanation.

Sentence: "${translated}"`;

const COMPARE_PROMPT = (source: string, back: string, language: string) =>
  `You are a classical Islamic scholar grounded in the Maturidi/Hanafi tradition (Ahl al-Sunnah wal-Jama'ah), comparing two English sentences. The second is a back-translation of a ${language} rendering of the first.

Original: "${source}"
Back-translation: "${back}"

Do they mean exactly the same thing? Answer false if the back-translation adds, removes, weakens, strengthens or alters any theological claim, or implies any physical form, spatial location, or resemblance to created things for God. Differences of wording that do not change the meaning are fine. Maintain ${TANZIH_CONSTRAINT}.

Return ONLY a valid JSON object, no prose, no markdown:
{ "same": true }`;

/** One paced, budgeted call of the meaning check. */
async function checkCall(
  prompt: string,
  opts: CallAiOptions,
  hooks?: TranslationVerifyHooks
): Promise<string> {
  if (hooks?.spendBudget && !hooks.spendBudget()) {
    incr("translation_verify_skipped_budget");
    throw new TranslationBudgetExhaustedError();
  }
  await hooks?.pacer?.waitTurn();
  try {
    return await callAI(prompt, opts);
  } finally {
    hooks?.pacer?.noteRequest();
  }
}

export type MeaningCheck = "same" | "drift" | "refusal" | "failed";

/**
 * Back-translation check that a localized sentence still means exactly what the
 * canonical English `source` says. Call 1 renders the translation back into
 * English WITHOUT seeing the source (so it cannot just echo it); call 2 asks
 * whether the back-translation says the same thing as the source. Only an
 * explicit `same: true` passes. Quota/key/rate-limit/cancel signals and budget
 * exhaustion propagate to the caller's own handler; any other failure of the
 * check counts as not verified.
 */
export async function checkTranslationMeaning(
  source: string,
  translated: string,
  language: string,
  opts: CallAiOptions,
  hooks?: TranslationVerifyHooks
): Promise<MeaningCheck> {
  try {
    const back = (await checkCall(BACK_TRANSLATE_PROMPT(translated, language), opts, hooks)).trim();
    if (looksLikeRefusal(back)) return "refusal";
    if (back === "") return "failed";

    const reply = await checkCall(COMPARE_PROMPT(source, back, language), opts, hooks);
    if (looksLikeRefusal(reply)) return "refusal";
    const match = reply.match(/\{[\s\S]*\}/);
    if (!match) return "failed";
    const verdict: unknown = JSON.parse(match[0]);
    if (typeof verdict !== "object" || verdict === null) return "failed";
    // Only an explicit boolean is a verdict: true approves, false is drift. A
    // missing or non-boolean value is a malformed reply, i.e. a failed check.
    const same = (verdict as { same?: unknown }).same;
    if (same === true) return "same";
    if (same === false) return "drift";
    return "failed";
  } catch (err) {
    if (
      err instanceof TranslationBudgetExhaustedError ||
      err instanceof GeminiDailyQuotaError ||
      err instanceof GeminiKeyInvalidError ||
      err instanceof GeminiRateLimitError ||
      opts.signal?.aborted ||
      (err instanceof Error && err.name === "AbortError")
    ) {
      throw err;
    }
    console.error("translateReason: meaning check failed:", err);
    return "failed";
  }
}

/**
 * Translates (not re-derives) a canonical English `reason` sentence into the
 * target language, so the underlying theological justification stays exactly
 * what was already generated and validated in English.
 *
 * THEOLOGICAL-REVIEW TOUCHPOINT: this prompt governs every localized
 * divine-name reason, divine-name reflection paragraph and pairing
 * explanation, and every localized verse-connection reason. The wording
 * is intentionally minimal and constrained — do not loosen it (see AGENTS.md
 * "AI-specific correctness").
 *
 * A translation that passes {@link validateTranslation} must also pass the
 * back-translation meaning check ({@link checkTranslationMeaning}) before it is returned:
 * the localized text is cached for every user, and the English-only Tashbih
 * regex cannot see a theological change made in another language. This costs
 * two extra calls per translation, paced and budgeted through `verifyHooks`
 * for batch jobs.
 *
 * Returns "" when the model output is empty or fails {@link validateTranslation};
 * every caller already treats "" as "skip, keep the English reason, retry later"
 * rather than persisting it. `onRejected` is called with the specific reason
 * before that "" is returned — used by callers that route through
 * `resolveAndGenerate` (see lib/names/name-content.ts) to call `markRefusal()`
 * on a `"refusal"` rejection, so a Claude refusal on translating a reason isn't
 * silently backed by Gemini the way a genuinely empty/malformed translation is.
 */
export async function translateReason(
  reason: string,
  language: string,
  opts: CallAiOptions = {},
  onRejected?: (reason: TranslationRejection) => void,
  validationOpts?: { maxLengthRatio?: number },
  verifyHooks?: TranslationVerifyHooks
): Promise<string> {
  const prompt = `Translate the following sentence into ${language}. Preserve its meaning exactly — do not add, remove, or alter any theological claim, and maintain ${TANZIH_CONSTRAINT}. Return ONLY the translated sentence, with no quotation marks, labels, or explanation.

Sentence: "${reason}"`;
  const translated = (await callAI(prompt, opts)).trim();
  // The caller paces and notes this request only after we return, which is
  // after the meaning check's own calls; note it now so the first check is
  // spaced from it like every other request.
  verifyHooks?.pacer?.noteRequest();
  if (translated === "") return "";

  const verdict = validateTranslation(reason, translated, validationOpts);
  if (!verdict.ok) {
    console.error(`translateReason: rejected translation into ${language} (${verdict.reason})`);
    incr(`translation_rejected_${verdict.reason}`);
    onRejected?.(verdict.reason);
    return "";
  }

  const check = await checkTranslationMeaning(reason, verdict.text, language, opts, verifyHooks);
  if (check !== "same") {
    const rejection: TranslationRejection =
      check === "refusal" ? "refusal" : check === "drift" ? "meaning_drift" : "verification_failed";
    console.error(`translateReason: meaning check rejected the ${language} translation (${check})`);
    incr(`translation_rejected_${rejection}`);
    onRejected?.(rejection);
    return "";
  }
  return verdict.text;
}
