/**
 * Test double for the connection-verification pass (see verifyConnections in
 * lib/ai/connection-generator.ts). The verifier fails closed, so a mocked model
 * that answers the verification prompt with anything but a verdict array makes
 * generation throw. Tests that are about something else route the verification
 * prompt through here to get a well-formed "every proposal is valid" reply.
 */
const VERIFICATION_MARKER = "reviewing another scholar's proposed Quran verse connections";

export function isVerificationPrompt(prompt: string): boolean {
  return prompt.includes(VERIFICATION_MARKER);
}

/** One `{ ref, valid: true }` verdict per `- <ref>: "<reason>"` proposal line in the prompt. */
export function approveAllVerdicts(prompt: string): string {
  const refs = [...prompt.matchAll(/^- (\d+:\d+): /gm)].map((m) => m[1]);
  return JSON.stringify(refs.map((ref) => ({ ref, valid: true })));
}
