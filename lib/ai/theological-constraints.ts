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
