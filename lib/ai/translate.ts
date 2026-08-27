import { callAI, type CallAiOptions } from "@/lib/ai/ai";
import { TANZIH_CONSTRAINT } from "@/lib/ai/theological-constraints";

/**
 * Translates (not re-derives) a canonical English `reason` sentence into the
 * target language, so the underlying theological justification stays exactly
 * what was already generated and validated in English.
 *
 * THEOLOGICAL-REVIEW TOUCHPOINT: this prompt governs every localized
 * divine-name reason and every localized verse-connection reason. The wording
 * is intentionally minimal and constrained — do not loosen it (see AGENTS.md
 * "AI-specific correctness").
 */
export async function translateReason(
  reason: string,
  language: string,
  opts: CallAiOptions = {}
): Promise<string> {
  const prompt = `Translate the following sentence into ${language}. Preserve its meaning exactly — do not add, remove, or alter any theological claim, and maintain ${TANZIH_CONSTRAINT}. Return ONLY the translated sentence, with no quotation marks, labels, or explanation.

Sentence: "${reason}"`;
  const translated = await callAI(prompt, opts);
  return translated.trim();
}
