import { callAI } from "@/lib/ai/ai";
import { looksLikeRefusal } from "@/lib/ai/refusal";
import { TANZIH_CONSTRAINT } from "@/lib/ai/theological-constraints";
import { incr } from "@/lib/infra/metrics";
import type { DivineName } from "@/lib/names/divine-names/types";
import type { GenerationContext } from "@/lib/names/name-content";

/**
 * Second-pass AI review of generated divine-name content (reflections and
 * pairing explanations) before it is cached for every user: the same idea as
 * `verifyConnections` for verse connections, so these are no longer gated by
 * the regex Tashbih backstop alone.
 *
 * Fails CLOSED the way the names routes already treat a bad generation: any
 * error, refusal, unparseable reply or missing verdict means "not approved",
 * and the caller returns its empty value, which is not cached and is retried.
 * Only an explicit `valid: true` approves. A refusal calls `ctx.markRefusal()`
 * (so Claude's refusal is not silently answered by Gemini); a plain rejection
 * does not, because a second attempt is then legitimate.
 *
 * The review runs on the same provider/model pair the content was generated
 * with (`ctx`), and costs one call per generated artifact, cached once per
 * name and kind. It is not rate-limited separately: the limiter counts
 * generation efforts, not calls.
 */

function header(name: DivineName): string {
  return `You are a classical Islamic scholar grounded in the Maturidi/Hanafi tradition (Ahl al-Sunnah wal-Jama'ah), reviewing content that another scholar wrote about a divine name of Allah, before it is shown to readers.

Divine name: ${name.transliteration} (${name.arabic}) — "${name.meaning}"
Context: ${name.description}`;
}

const CRITERIA = `For each item, judge whether:
- It is accurate to the meaning of this name and to classical Islamic scholarship, with no false or misattributed claim.
- It stays within ${TANZIH_CONSTRAINT}.
- It does not contradict the Maturidi/Hanafi creed.`;

/** One call; `null` when the call failed or the model refused (already logged/metered). */
async function ask(prompt: string, ctx: GenerationContext, what: string): Promise<string | null> {
  let text: string;
  try {
    text = await callAI(prompt, { feature: "names", provider: ctx.provider, model: ctx.model });
  } catch (err) {
    console.error(`Name verification (${what}): call failed, discarding content:`, err);
    incr("names_verify_call_failed");
    return null;
  }
  if (looksLikeRefusal(text)) {
    console.error(`Name verification (${what}): model refused, discarding content`);
    incr("names_ai_refusal");
    ctx.markRefusal();
    return null;
  }
  return text;
}

function parseJson(text: string, pattern: RegExp, what: string): unknown {
  const match = text.match(pattern);
  if (!match) {
    console.error(`Name verification (${what}): no JSON in the reply`);
    incr("names_verify_unparseable");
    return undefined;
  }
  try {
    return JSON.parse(match[0]);
  } catch (err) {
    console.error(`Name verification (${what}): invalid JSON in the reply:`, err);
    incr("names_verify_unparseable");
    return undefined;
  }
}

/** True only when the reviewer explicitly approves the reflection. */
export async function verifyReflection(
  name: DivineName,
  reflection: string,
  ctx: GenerationContext
): Promise<boolean> {
  const prompt = `${header(name)}

Reflection to review:
"""
${reflection}
"""

${CRITERIA}

Return ONLY a valid JSON object, no prose, no markdown:
{ "valid": true }`;
  const text = await ask(prompt, ctx, `reflection ${name.slug}`);
  if (text === null) return false;
  // An object was asked for: a reply whose JSON starts as an array is not an
  // approval, even if an object inside it says valid:true.
  const firstJson = text.search(/[{[]/);
  const verdict =
    firstJson !== -1 && text[firstJson] === "{"
      ? parseJson(text, /\{[\s\S]*\}/, `reflection ${name.slug}`)
      : undefined;
  const approved =
    typeof verdict === "object" &&
    verdict !== null &&
    (verdict as { valid?: unknown }).valid === true;
  if (!approved) incr("names_rejected_verification");
  return approved;
}

/**
 * The pairings the reviewer explicitly approves, in their original order.
 * A pairing without an approving verdict (rejected, unmentioned, or both
 * approved and rejected) is dropped; any failure returns `[]`.
 */
export async function verifyPairings<T extends { name: string; explanation: string }>(
  name: DivineName,
  pairings: T[],
  ctx: GenerationContext
): Promise<T[]> {
  if (pairings.length === 0) return pairings;
  const proposals = pairings.map((p) => `- ${p.name}: "${p.explanation}"`).join("\n");
  const prompt = `${header(name)}

Proposed pairings of this name with other names, each with the explanation of how they relate:
${proposals}

${CRITERIA}
For a pairing, "accurate" also means the explanation correctly describes how the two names relate.

Return ONLY a valid JSON array, one entry per proposal, using the name slug shown, no prose, no markdown:
[
  { "name": "slug", "valid": true }
]`;
  const text = await ask(prompt, ctx, `pairings ${name.slug}`);
  if (text === null) return [];
  const verdicts = parseJson(text, /\[[\s\S]*\]/, `pairings ${name.slug}`);
  if (!Array.isArray(verdicts)) return [];

  const approved = new Set<string>();
  const rejected = new Set<string>();
  for (const v of verdicts) {
    if (typeof v !== "object" || v === null) continue;
    const { name: slug, valid } = v as { name?: unknown; valid?: unknown };
    if (typeof slug !== "string" || typeof valid !== "boolean") continue;
    (valid ? approved : rejected).add(slug);
  }
  const kept = pairings.filter((p) => approved.has(p.name) && !rejected.has(p.name));
  if (kept.length < pairings.length) {
    incr("names_rejected_verification", pairings.length - kept.length);
  }
  return kept;
}
