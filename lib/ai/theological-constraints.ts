/**
 * Shared Tanzih/Tashbih constraint text — see AGENTS.md's theological
 * standards ("Maintain strict Tanzih (transcendence)... never describe
 * divine attributes in ways that imply physical form, spatial location,
 * or resemblance to created things (Tashbih)"). Every AI prompt that could
 * describe a divine attribute must include this. Defined as a noun phrase
 * (not a full imperative sentence) so each call site keeps its own natural
 * grammar/framing while only the constraint definition itself — the part
 * at risk of drifting — is centralized.
 */
export const TANZIH_CONSTRAINT =
  "strict Tanzih (divine transcendence): never describe or imply physical form, spatial location, or resemblance to created things (Tashbih)";

/**
 * Deterministic post-hoc scan for the most common Tashbih phrasing patterns, as
 * a defense-in-depth backstop to the prompt-only TANZIH_CONSTRAINT above (which
 * only asks the model to comply — nothing previously checked that it did). Not
 * exhaustive: this catches blunt violations cheaply, before spending an AI
 * verification call on a candidate that's already disqualified.
 */
export const TASHBIH_PHRASES: RegExp[] = [
  /\bhas a (physical )?body\b/i,
  /\bsits? (on|upon) (a |the )?throne\b/i,
  /\bliteral(ly)? (hand|face|eye|body|form)\b/i,
  /\bresembles? (a |an )?(human|man|woman|creation|creature)\b/i,
  /\bphysical form\b/i,
  /\btakes? (on |the )?(a |the )?(human|physical) (form|shape)\b/i,
  /\bhas (a |the )?(shape|appearance) of\b/i,
];

/**
 * The shared backstop every AI-generation call site runs on its output before
 * caching or serving it (connections, divine-names reflection/pairings/verses,
 * translated reasons). English-only: the patterns can't see a violation
 * phrased in another language, which is why every AI generation path writes
 * its content in English first and only localizes it afterwards through
 * translateReason (lib/ai/translate.ts). A violation introduced during that
 * translation step is still covered only by the prompt-side TANZIH_CONSTRAINT.
 */
export function containsTashbih(text: string): boolean {
  return TASHBIH_PHRASES.some((re) => re.test(text));
}
