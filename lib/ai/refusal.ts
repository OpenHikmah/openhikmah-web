/**
 * Heuristic: does an AI response *begin* with a refusal / disclaimer opener?
 *
 * Deliberately narrow — anchored to the start of the text and matching only
 * unambiguous refusal phrasings — so it never suppresses genuine theological
 * content. A "Believer's Reflection" opens with its subject ("The believer's
 * realisation of ..."), never "I'm sorry" or "As an AI". Used so a soft model
 * refusal is treated like an empty result (logged, not cached as canonical,
 * not silently backed by a different provider) rather than persisted
 * verbatim. See the names reflection/pairings/verses routes and
 * `translateReason` (`lib/ai/translate.ts`) — all of them call
 * `GenerationContext.markRefusal()` (`lib/names/name-content.ts`) on a hit,
 * so a detected refusal skips the Claude->Gemini fallback everywhere, not
 * just the caching decision. Note the pattern is English-anchored — callers
 * translating into another language get only best-effort refusal detection
 * from it.
 */
const REFUSAL_OPENER =
  /^\s*(?:i(?:['’ ]?a?m)? (?:sorry|unable|not able)\b|i can(?:not|['’]t)\b|i (?:can(?:not|['’]t)|won['’]t|will not) (?:help|assist|provide|comply|generate|write)\b|i (?:must|have to) decline\b|i['’]m not (?:going to|able to)\b|as an ai\b|as a language model\b|i (?:apologi[sz]e|cannot in good conscience)\b|unfortunately,?\s+i\b)/i;

export function looksLikeRefusal(text: string): boolean {
  return REFUSAL_OPENER.test(text);
}
