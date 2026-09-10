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
 */
const MAX_LENGTH_RATIO = 3;
const MIN_LENGTH_RATIO = 0.35;
const MIN_SOURCE_LEN_FOR_MIN_RATIO = 25;

/** Leading "Sure! Here is the translation:" / "Translation:" wrappers the model
 *  is told not to add but sometimes does. Only a single recognized label at the
 *  very start is stripped. */
const LABEL_PREFIX =
  /^\s*(?:sure[,!.]?\s+)?(?:here(?:'s| is)[^:]*:|translation:|translated(?: sentence| text)?:)\s*/i;

export type TranslationRejection = "label-prefix" | "refusal" | "english-echo" | "length-ratio";

export type TranslationVerdict =
  { ok: true; text: string } | { ok: false; reason: TranslationRejection };

/**
 * Validates a non-empty model translation of `source` before it can be cached
 * as canonical localized theology. Strips a leading label wrapper if present,
 * then rejects refusals, verbatim English echoes, and wild length mismatches.
 */
export function validateTranslation(source: string, translated: string): TranslationVerdict {
  const hadLabel = LABEL_PREFIX.test(translated);
  const stripped = translated.replace(LABEL_PREFIX, "").trim();

  if (stripped === "") return { ok: false, reason: "label-prefix" };
  if (looksLikeRefusal(stripped)) return { ok: false, reason: "refusal" };

  const src = source.trim();
  if (stripped.toLowerCase() === src.toLowerCase()) {
    // translateReason is only ever called cross-language, so a verbatim echo of
    // the English source is always a failed translation.
    return { ok: false, reason: "english-echo" };
  }

  const ratio = stripped.length / Math.max(src.length, 1);
  if (
    ratio > MAX_LENGTH_RATIO ||
    (src.length >= MIN_SOURCE_LEN_FOR_MIN_RATIO && ratio < MIN_LENGTH_RATIO)
  ) {
    return { ok: false, reason: "length-ratio" };
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
 * rather than persisting it.
 */
export async function translateReason(
  reason: string,
  language: string,
  opts: CallAiOptions = {}
): Promise<string> {
  const prompt = `Translate the following sentence into ${language}. Preserve its meaning exactly — do not add, remove, or alter any theological claim, and maintain ${TANZIH_CONSTRAINT}. Return ONLY the translated sentence, with no quotation marks, labels, or explanation.

Sentence: "${reason}"`;
  const translated = (await callAI(prompt, opts)).trim();
  if (translated === "") return "";

  const verdict = validateTranslation(reason, translated);
  if (!verdict.ok) {
    console.error(`translateReason: rejected translation into ${language} (${verdict.reason})`);
    incr(`translation_rejected_${verdict.reason}`);
    return "";
  }
  return verdict.text;
}
