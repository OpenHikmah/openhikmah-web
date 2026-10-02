/**
 * Test double for the divine-name content review (see lib/names/name-verify.ts).
 * The review fails closed, so a mocked model that answers its prompt with
 * anything but a verdict makes generation return empty. Tests about something
 * else route the review prompt through here to get a well-formed approval.
 */
const NAME_VERIFICATION_MARKER = "reviewing content that another scholar wrote about a divine name";

export function isNameVerificationPrompt(prompt: string): boolean {
  return prompt.includes(NAME_VERIFICATION_MARKER);
}

/** The back-translation meaning check of translateReason (lib/ai/translate.ts). */
export function isTranslationCheckPrompt(prompt: string): boolean {
  return (
    prompt.startsWith("Render the following") || prompt.includes("comparing two English sentences")
  );
}

/** `{ valid: true }` for a reflection review; one approving verdict per `- <slug>: "..."` line for pairings. */
export function approveNameVerification(prompt: string): string {
  // translateReason's meaning check: a faithful back-translation, then "same".
  if (prompt.startsWith("Render the following")) return "A faithful English rendering.";
  if (prompt.includes("comparing two English sentences")) return JSON.stringify({ same: true });
  if (prompt.includes("Reflection to review")) return JSON.stringify({ valid: true });
  const slugs = [...prompt.matchAll(/^- ([a-z0-9-]+): "/gm)].map((m) => m[1]);
  return JSON.stringify(slugs.map((name) => ({ name, valid: true })));
}
