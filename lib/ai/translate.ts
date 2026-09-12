import { callAI, type CallAiOptions } from "@/lib/ai/ai";
import { looksLikeRefusal } from "@/lib/ai/refusal";
import { TANZIH_CONSTRAINT } from "@/lib/ai/theological-constraints";
import { incr } from "@/lib/infra/metrics";

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

export type TranslationRejection = "label_prefix" | "refusal" | "english_echo" | "length_ratio";

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
 */
export function validateTranslation(source: string, translated: string): TranslationVerdict {
  const hadLabel = LABEL_PREFIX.test(translated);
  const stripped = translated.replace(LABEL_PREFIX, "").trim();

  if (stripped === "") return { ok: false, reason: "label_prefix" };
  if (looksLikeRefusal(stripped)) return { ok: false, reason: "refusal" };

  const src = source.trim();
  if (normalizeForEcho(stripped) === normalizeForEcho(src)) {
    // translateReason is only ever called cross-language, so an echo of the
    // English source is always a failed translation.
    return { ok: false, reason: "english_echo" };
  }

  const ratio = stripped.length / Math.max(src.length, 1);
  if (
    ratio > MAX_LENGTH_RATIO ||
    (src.length >= MIN_SOURCE_LEN_FOR_MIN_RATIO && ratio < MIN_LENGTH_RATIO)
  ) {
    return { ok: false, reason: "length_ratio" };
  }

  return { ok: true, text: hadLabel ? stripped : translated };
}

/**
 * Translates (not re-derives) a canonical English `reason` sentence into the
 * target language, so the underlying theological justification stays exactly
 * what was already generated and validated in English.
 *
 * THEOLOGICAL-REVIEW TOUCHPOINT: this prompt governs every localized
 * divine-name reason and every localized verse-connection reason. The wording
 * is intentionally minimal and constrained — do not loosen it (see AGENTS.md
 * "AI-specific correctness").
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
  onRejected?: (reason: TranslationRejection) => void
): Promise<string> {
  const prompt = `Translate the following sentence into ${language}. Preserve its meaning exactly — do not add, remove, or alter any theological claim, and maintain ${TANZIH_CONSTRAINT}. Return ONLY the translated sentence, with no quotation marks, labels, or explanation.

Sentence: "${reason}"`;
  const translated = (await callAI(prompt, opts)).trim();
  if (translated === "") return "";

  const verdict = validateTranslation(reason, translated);
  if (!verdict.ok) {
    console.error(`translateReason: rejected translation into ${language} (${verdict.reason})`);
    incr(`translation_rejected_${verdict.reason}`);
    onRejected?.(verdict.reason);
    return "";
  }
  return verdict.text;
}
