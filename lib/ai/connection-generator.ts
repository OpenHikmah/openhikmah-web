import { callAIDetailed, type Provider } from "@/lib/ai/ai";
import { getPrompt, renderTemplate } from "@/lib/ai/prompt-registry";
import { TANZIH_CONSTRAINT, TASHBIH_PHRASES } from "@/lib/ai/theological-constraints";
import { db } from "@/lib/infra/db";
import { aiGenerations } from "@/lib/infra/db/schema";
import { isValidRef, getVerses } from "@/lib/quran/quran-corpus";
import { incr } from "@/lib/infra/metrics";
import { LOCALE_LANGUAGE_NAME, type Locale } from "@/lib/i18n/config";
import type { ConnectionResult, EdgeKind, Verse } from "@/types/quran";

/**
 * The ONLY module that calls the AI. Two paths:
 *
 *   - generateGroundedConnections — the preferred "AI articulates" half of the
 *     separation of powers. Receives REAL candidate verses discovered from
 *     canonical data and asks the model only to SELECT among them and explain
 *     why. Returned refs are validated against the candidate set, so the model
 *     cannot introduce a verse that wasn't discovered.
 *   - generateConnections — the legacy fallback used only when no grounding data
 *     is available for a verse. The model proposes refs from memory; they are
 *     validated to exist in the corpus (rejecting invented references).
 *
 * Both log the generation to `ai_generations`.
 */

/** Optional generation controls. `provider` / `model` force a specific LLM for
 *  this call (the admin batch job's per-run pick), bypassing the feature/global
 *  flags. `model` is applied only when it belongs to the resolved provider. */
export interface GenerateOpts {
  provider?: Provider;
  model?: string;
  /** Explicit Gemini API key (the admin backfill loop's per-key pick). */
  apiKey?: string;
  /** Cooperative-cancel signal, threaded to the LLM call so a rate-limit backoff
   *  wait aborts when the admin stops the job. */
  signal?: AbortSignal;
  /** Reasons of already-active connections for this fromRef+kind, used to
   *  reject a new candidate whose reason just restates one of them in
   *  different words. Omitted (or empty) on a cell's first-ever generation,
   *  where there's nothing yet to be redundant with. */
  existingReasons?: string[];
  /** Batch job's spend guard for the extra verification call this module
   *  makes after the deterministic gate. Returns false when the run is out of
   *  budget — verification is then skipped (candidates pass through
   *  unverified) rather than blocking or throwing. Omitted for live traffic,
   *  which has no run-level cost budget. */
  spendBudget?: () => boolean;
  /** Batch job's pacer, so the verification call is spaced out from the main
   *  generation call like every other real request it makes (avoiding a burst
   *  that trips a provider's per-minute rate limit). `noteRequest` must be
   *  called right after the main generation call too, or the pacer never
   *  learns a request is owed before the verification call's `waitTurn`.
   *  Omitted for live traffic, which isn't paced. */
  pacer?: { waitTurn: () => Promise<void>; noteRequest: () => void };
}

const MIN_REASON_CHARS = 25;
const MIN_REASON_WORDS = 5;
const RESTATEMENT_OVERLAP_THRESHOLD = 0.7;
const REDUNDANCY_SIMILARITY_THRESHOLD = 0.6;
const CONFIDENCE_THRESHOLD = 60;

function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .split(/\s+/)
    .filter(Boolean);
}

/** Fraction of `a`'s words that also appear in `b` — catches a reason that
 *  mostly just echoes a verse's translation instead of explaining a
 *  connection. */
function overlapRatio(a: string[], b: string[]): number {
  if (a.length === 0) return 0;
  const bSet = new Set(b);
  return a.filter((w) => bSet.has(w)).length / a.length;
}

/** Jaccard similarity between two word sets — catches a new reason that says
 *  essentially the same thing as an existing one, just reworded. */
function jaccardSimilarity(a: string[], b: string[]): number {
  const aSet = new Set(a);
  const bSet = new Set(b);
  if (aSet.size === 0 || bSet.size === 0) return 0;
  let shared = 0;
  for (const w of aSet) if (bSet.has(w)) shared++;
  const union = aSet.size + bSet.size - shared;
  return union === 0 ? 0 : shared / union;
}

/**
 * Deterministic content gate applied to every candidate before it's ever
 * persisted — cheap checks, so a candidate that's obviously bad never reaches
 * the paid AI verification pass. Each rejection is counted (see incr calls
 * below), never silent.
 */
function passesContentHeuristics(
  reason: string,
  sourceTranslation: string,
  candidateTranslation: string
): boolean {
  const words = wordsOf(reason);
  if (reason.trim().length < MIN_REASON_CHARS || words.length < MIN_REASON_WORDS) {
    incr("connection_rejected_too_short");
    return false;
  }
  if (TASHBIH_PHRASES.some((re) => re.test(reason))) {
    incr("connection_rejected_tashbih");
    return false;
  }
  const restatesSource =
    overlapRatio(words, wordsOf(sourceTranslation)) > RESTATEMENT_OVERLAP_THRESHOLD;
  const restatesCandidate =
    overlapRatio(words, wordsOf(candidateTranslation)) > RESTATEMENT_OVERLAP_THRESHOLD;
  if (restatesSource || restatesCandidate) {
    incr("connection_rejected_restatement");
    return false;
  }
  return true;
}

function isRedundant(reason: string, existingReasons: string[]): boolean {
  const words = wordsOf(reason);
  const redundant = existingReasons.some(
    (existing) => jaccardSimilarity(words, wordsOf(existing)) > REDUNDANCY_SIMILARITY_THRESHOLD
  );
  if (redundant) incr("connection_rejected_redundant");
  return redundant;
}

function tokensFromUsage(
  usage: { inputTokens: number; outputTokens: number } | null
): number | null {
  return usage ? usage.inputTokens + usage.outputTokens : null;
}

const KIND_INSTRUCTIONS: Record<EdgeKind, string> = {
  thematic:
    "Find 3 other Quran verses that share the same theological theme as the given verse. Focus on verses that reinforce or expand the same divine message.",
  root: "Find 3 other Quran verses that share a significant Arabic root word with the given verse. The shared root should carry meaning relevant to the verse's central message.",
  contrast:
    "Find 3 other Quran verses that present a contrasting theological concept to the given verse — opposing states such as ease/hardship, gratitude/ingratitude, mercy/punishment.",
};

const KIND_SELECTION: Record<EdgeKind, string> = {
  thematic:
    "Select the 3 candidates that most strongly share the same theological theme as the source verse — reinforcing or expanding the same divine message.",
  root: "Select the 3 candidates whose shared Arabic root carries meaning most relevant to the source verse's central message.",
  contrast:
    "Select the 3 candidates that present the clearest contrasting theological concept to the source verse — opposing states such as ease/hardship, gratitude/ingratitude, mercy/punishment.",
};

// Fallback templates used when no active prompt_versions row exists for the
// key (see lib/ai/prompt-registry.ts). `{{placeholders}}` are filled per-call
// via renderTemplate — this is also the format an admin's DB-stored override
// must follow.
const LEGACY_FALLBACK_TEMPLATE = `You are a classical Islamic scholar grounded in the Maturidi/Hanafi tradition (Ahl al-Sunnah wal-Jama'ah).

Given this Quran verse:
Reference: {{fromRef}}
Arabic: {{arabicText}}
Translation: {{translation}}

Task: {{task}}

Rules:
- Return EXACTLY 3 different verses (not the source verse).
- Verse references must be real and accurate (format: surah:ayah, e.g. 2:255).
- Each reason must be one concise sentence explaining the {{kind}} connection in classical Islamic terms.
- Include a "confidence" integer from 0-100: your genuine certainty that this is a correct, well-justified connection.
- Return ONLY a valid JSON array. No prose, no markdown, no explanation outside the JSON.

Output format:
[
  { "ref": "surah:ayah", "reason": "one-sentence theological justification", "confidence": 0 },
  { "ref": "surah:ayah", "reason": "one-sentence theological justification", "confidence": 0 },
  { "ref": "surah:ayah", "reason": "one-sentence theological justification", "confidence": 0 }
]`;

// Empty for English. Appended AFTER the resolved template (fallback OR an
// admin's prompt_versions override) rather than filled into a `{{language}}`
// placeholder — an override created before this locale support existed has
// no such placeholder, and renderTemplate silently drops unfilled ones, which
// would silently keep generating English regardless of the requester's
// locale. Appending guarantees the directive always reaches the model.
function languageDirective(locale: Locale): string {
  if (locale === "en") return "";
  return `\n\nWrite each "reason" in ${LOCALE_LANGUAGE_NAME[locale]}. Keep "ref" in "surah:ayah" format, and keep the Tanzih/Tashbih constraint above unchanged.`;
}

// Deliberately NOT part of either overridable template (see prompt-registry.ts):
// appended after the resolved template — fallback OR an admin's DB-stored
// override — the same way languageDirective is, so an admin override can
// change task wording but can never omit this constraint.
function tanzihDirective(): string {
  return `\n\n- Maintain ${TANZIH_CONSTRAINT}.`;
}

async function buildPrompt(
  fromRef: string,
  arabicText: string,
  translation: string,
  kind: EdgeKind,
  locale: Locale
): Promise<{ text: string; promptVersion: number | null }> {
  const { template, version } = await getPrompt("connection.legacy", LEGACY_FALLBACK_TEMPLATE);
  const text =
    renderTemplate(template, {
      fromRef,
      arabicText,
      translation,
      task: KIND_INSTRUCTIONS[kind],
      kind,
    }) +
    tanzihDirective() +
    languageDirective(locale);
  return { text, promptVersion: version };
}

/**
 * A connection-generation response that could not be parsed as a JSON array —
 * a refusal, a prose preamble, truncated output, or invalid JSON. Distinct from
 * a *well-formed* empty selection (`[]`), which is a valid "nothing more to
 * connect" answer. Callers must treat this as a transient generation failure,
 * never as a genuinely exhausted candidate pool (see lib/ai/connection-batch.ts).
 */
export class ConnectionParseError extends Error {
  constructor(reason: string, sample: string) {
    super(`${reason}: ${sample.slice(0, 300)}`);
    this.name = "ConnectionParseError";
  }
}

function parseRawConnections(
  text: string
): Array<{ ref: string; reason: string; confidence?: number }> {
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new ConnectionParseError("no JSON array in AI response", text);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (err) {
    throw new ConnectionParseError(
      `invalid JSON in AI response (${(err as Error).message})`,
      jsonMatch[0]
    );
  }
  if (!Array.isArray(parsed)) {
    throw new ConnectionParseError("AI response JSON was not an array", jsonMatch[0]);
  }
  const valid = parsed
    .filter(
      (c): c is { ref: string; reason: string; confidence?: unknown } =>
        c &&
        typeof c.ref === "string" &&
        typeof c.reason === "string" &&
        // A blank reason is the wrong shape here too: every edge on the canvas
        // links to its explanation, so a connection with no text isn't one. The
        // translation write-paths already reject blank output.
        c.reason.trim() !== ""
    )
    .map((c) => {
      // An out-of-range or non-numeric confidence is dropped, not treated as
      // malformed — the ref+reason are still usable, they just aren't
      // threshold-checked (matches a response predating this field, e.g. an
      // admin's DB-stored prompt override).
      const confidence =
        typeof c.confidence === "number" &&
        Number.isInteger(c.confidence) &&
        c.confidence >= 0 &&
        c.confidence <= 100
          ? c.confidence
          : undefined;
      return { ref: c.ref, reason: c.reason, confidence };
    });
  // A non-empty array whose entries are ALL the wrong shape (or all blank) is
  // malformed output, not a valid empty selection — the caller must not read it
  // as "pool exhausted". A partially-valid array (some good entries, some junk)
  // keeps the good ones, matching the model's evident intent.
  if (parsed.length > 0 && valid.length === 0) {
    throw new ConnectionParseError("AI response array had no well-formed entries", jsonMatch[0]);
  }
  return valid;
}

/**
 * Generates up to 3 validated, fully-hydrated connections for a source verse.
 * Returns an empty array when the model well-formedly proposes nothing (or
 * nothing survives corpus validation). Throws {@link ConnectionParseError} when
 * the model response can't be parsed — callers must treat that as a transient
 * failure, not an empty result.
 */
export async function generateConnections(
  fromRef: string,
  arabicText: string,
  translation: string,
  kind: EdgeKind,
  locale: Locale = "en",
  opts: GenerateOpts = {}
): Promise<ConnectionResult[]> {
  const { text: prompt, promptVersion } = await buildPrompt(
    fromRef,
    arabicText,
    translation,
    kind,
    locale
  );
  const res = await callAIDetailed(prompt, {
    feature: "connections",
    provider: opts.provider,
    model: opts.model,
    apiKey: opts.apiKey,
    signal: opts.signal,
  });
  opts.pacer?.noteRequest();
  const text = res.text;

  // Best-effort audit log — never fail generation because logging failed.
  try {
    await db.insert(aiGenerations).values({
      fromRef,
      kind,
      model: res.model,
      tokens: tokensFromUsage(res.usage),
      promptVersion,
    });
  } catch (err) {
    console.error("ai_generations log failed:", err);
  }

  const candidates = parseRawConnections(text)
    .filter((c) => isValidRef(c.ref) && c.ref !== fromRef)
    .slice(0, 3);

  // Hydrate from the LOCAL corpus only. This both drops hallucinated references
  // and guarantees a verse that isn't in the corpus can never be persisted as a
  // connection — independent of any external API's behaviour.
  const verseMap = await getVerses(candidates.map((c) => c.ref));

  const hydrated = candidates
    .map((c) => {
      const verse = verseMap.get(c.ref);
      return verse ? toResult(verse, c.reason, kind, c.confidence) : null;
    })
    .filter((c): c is ConnectionResult => c !== null);

  return applyQualityGateAndVerify(fromRef, arabicText, translation, kind, hydrated, opts);
}

const SELECTION_FALLBACK_TEMPLATE = `You are a classical Islamic scholar grounded in the Maturidi/Hanafi tradition (Ahl al-Sunnah wal-Jama'ah).

Source verse:
Reference: {{fromRef}}
Arabic: {{arabicText}}
Translation: {{translation}}

Below is a list of CANDIDATE verses, each pre-selected from canonical data as potentially related. Your task: {{task}}

Candidates:
{{candidates}}

Rules:
- Choose ONLY from the candidate references listed above. Do NOT introduce any verse that is not in the list.
- Return at most 3, fewer if fewer are genuinely appropriate.
- Each reason must be one concise sentence explaining the {{kind}} connection in classical Islamic terms.
- Include a "confidence" integer from 0-100: your genuine certainty that this is a correct, well-justified connection.
- Return ONLY a valid JSON array. No prose, no markdown, no explanation outside the JSON.

Output format:
[
  { "ref": "surah:ayah", "reason": "one-sentence theological justification", "confidence": 0 }
]`;

async function buildSelectionPrompt(
  fromRef: string,
  arabicText: string,
  translation: string,
  kind: EdgeKind,
  candidates: Verse[],
  locale: Locale
): Promise<{ text: string; promptVersion: number | null }> {
  const list = candidates.map((v) => `- ${v.ref} — ${v.translation}`).join("\n");
  const { template, version } = await getPrompt(
    "connection.selection",
    SELECTION_FALLBACK_TEMPLATE
  );
  const text =
    renderTemplate(template, {
      fromRef,
      arabicText,
      translation,
      task: KIND_SELECTION[kind],
      candidates: list,
      kind,
    }) +
    tanzihDirective() +
    languageDirective(locale);
  return { text, promptVersion: version };
}

function toResult(
  verse: Verse,
  reason: string,
  kind: EdgeKind,
  confidence?: number
): ConnectionResult {
  return {
    surah: verse.surah,
    ayah: verse.ayah,
    ref: verse.ref,
    arabicText: verse.arabicText,
    translation: verse.translation,
    surahName: verse.surahName,
    surahNameArabic: verse.surahNameArabic,
    reason,
    kind,
    confidence,
  };
}

/**
 * Combined content gate for candidates already hydrated into full verses:
 * deterministic heuristics (length, Tashbih phrasing, verse restatement) →
 * confidence threshold (only when the model supplied one) → redundancy against
 * both `opts.existingReasons` and candidates already accepted in this same
 * batch. Survivors go through one extra AI verification call. Cheapest checks
 * run first so an obviously-bad candidate never reaches the paid call.
 */
async function applyQualityGateAndVerify(
  fromRef: string,
  sourceArabic: string,
  sourceTranslation: string,
  kind: EdgeKind,
  hydrated: ConnectionResult[],
  opts: GenerateOpts
): Promise<ConnectionResult[]> {
  const acceptedReasons: string[] = [...(opts.existingReasons ?? [])];
  const accepted: ConnectionResult[] = [];

  for (const c of hydrated) {
    if (!passesContentHeuristics(c.reason, sourceTranslation, c.translation)) continue;
    if (c.confidence !== undefined && c.confidence < CONFIDENCE_THRESHOLD) {
      incr("connection_rejected_low_confidence");
      continue;
    }
    if (isRedundant(c.reason, acceptedReasons)) continue;
    accepted.push(c);
    acceptedReasons.push(c.reason);
  }

  if (accepted.length === 0) return accepted;
  return verifyConnections(fromRef, sourceArabic, sourceTranslation, kind, accepted, opts);
}

const VERIFY_TEMPLATE = `You are a classical Islamic scholar grounded in the Maturidi/Hanafi tradition (Ahl al-Sunnah wal-Jama'ah), reviewing another scholar's proposed Quran verse connections for accuracy and theological soundness.

Source verse:
Reference: {{fromRef}}
Arabic: {{arabicText}}
Translation: {{translation}}

Proposed {{kind}} connections to review:
{{proposals}}

For EACH proposed connection, judge whether:
- The reason genuinely and specifically justifies a {{kind}} connection between the two verses (not vague or generic).
- The reason stays within strict Tanzih and does not imply any physical form, spatial location, or resemblance to created things for God.

Return ONLY a valid JSON array, one entry per proposal in the same order, no prose, no markdown:
[
  { "ref": "surah:ayah", "valid": true }
]`;

interface VerifyVerdict {
  ref: string;
  valid: boolean;
}

function parseVerifyVerdicts(text: string): VerifyVerdict[] {
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new ConnectionParseError("no JSON array in verification response", text);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (err) {
    throw new ConnectionParseError(
      `invalid JSON in verification response (${(err as Error).message})`,
      jsonMatch[0]
    );
  }
  if (!Array.isArray(parsed)) {
    throw new ConnectionParseError("verification response JSON was not an array", jsonMatch[0]);
  }
  return parsed.filter(
    (v): v is VerifyVerdict => v && typeof v.ref === "string" && typeof v.valid === "boolean"
  );
}

/**
 * Second-pass AI check over the candidates that survived the deterministic
 * gate: one extra call (never one per candidate) asking the model to flag any
 * that don't genuinely justify the connection or that violate Tanzih.
 *
 * Fails OPEN, not closed: this is defense-in-depth layered on top of the other
 * checks, so a verifier call that errors or a response that doesn't parse must
 * not wipe out otherwise-valid connections — it just means this extra look
 * didn't happen for this batch. Skips the call entirely (no spend) when
 * there's nothing to verify, or when the batch job's budget is exhausted.
 */
export async function verifyConnections(
  fromRef: string,
  arabicText: string,
  translation: string,
  kind: EdgeKind,
  candidates: ConnectionResult[],
  opts: GenerateOpts
): Promise<ConnectionResult[]> {
  if (candidates.length === 0) return candidates;
  if (opts.spendBudget && !opts.spendBudget()) {
    incr("connection_verify_skipped_budget");
    return candidates;
  }

  const proposals = candidates.map((c) => `- ${c.ref}: "${c.reason}"`).join("\n");
  const prompt =
    renderTemplate(VERIFY_TEMPLATE, { fromRef, arabicText, translation, kind, proposals }) +
    tanzihDirective();

  await opts.pacer?.waitTurn();
  let res: Awaited<ReturnType<typeof callAIDetailed>>;
  try {
    res = await callAIDetailed(prompt, {
      feature: "connections",
      provider: opts.provider,
      model: opts.model,
      apiKey: opts.apiKey,
      signal: opts.signal,
    });
    opts.pacer?.noteRequest();
  } catch (err) {
    opts.pacer?.noteRequest();
    console.error("connection verification call failed, keeping candidates:", err);
    incr("connection_verify_call_failed");
    return candidates;
  }

  // Best-effort audit log — never fail verification because logging failed.
  try {
    await db.insert(aiGenerations).values({
      fromRef,
      kind,
      model: res.model,
      tokens: tokensFromUsage(res.usage),
      promptVersion: null,
    });
  } catch (err) {
    console.error("ai_generations log failed:", err);
  }

  let verdicts: VerifyVerdict[];
  try {
    verdicts = parseVerifyVerdicts(res.text);
  } catch (err) {
    console.error("connection verification response unparseable, keeping candidates:", err);
    incr("connection_verify_parse_failed");
    return candidates;
  }

  const invalidRefs = new Set(verdicts.filter((v) => !v.valid).map((v) => v.ref));
  const kept = candidates.filter((c) => !invalidRefs.has(c.ref));
  if (kept.length < candidates.length) {
    incr("connection_rejected_verification", candidates.length - kept.length);
  }
  return kept;
}

/**
 * Grounded generation: the model SELECTS from real discovered candidates and
 * explains each. Refs are validated against the candidate set, so a verse the
 * discovery step did not surface can never appear. Returns [] if no candidate
 * verses resolve (caller falls back to legacy generation) or the model
 * well-formedly selects nothing. Throws {@link ConnectionParseError} when the
 * model response can't be parsed.
 */
export async function generateGroundedConnections(
  fromRef: string,
  arabicText: string,
  translation: string,
  kind: EdgeKind,
  candidateRefs: string[],
  locale: Locale = "en",
  opts: GenerateOpts = {}
): Promise<ConnectionResult[]> {
  const verseMap = await getVerses(candidateRefs);
  const candidates = candidateRefs
    .map((ref) => verseMap.get(ref))
    .filter((v): v is Verse => v !== undefined && v.ref !== fromRef);
  if (candidates.length === 0) return [];

  const { text: prompt, promptVersion } = await buildSelectionPrompt(
    fromRef,
    arabicText,
    translation,
    kind,
    candidates,
    locale
  );
  const res = await callAIDetailed(prompt, {
    feature: "connections",
    provider: opts.provider,
    model: opts.model,
    apiKey: opts.apiKey,
    signal: opts.signal,
  });
  opts.pacer?.noteRequest();
  const text = res.text;

  try {
    await db.insert(aiGenerations).values({
      fromRef,
      kind,
      model: res.model,
      tokens: tokensFromUsage(res.usage),
      promptVersion,
    });
  } catch (err) {
    console.error("ai_generations log failed:", err);
  }

  const allowed = new Set<string>(candidates.map((v) => v.ref));
  const chosen = parseRawConnections(text)
    .filter((c) => allowed.has(c.ref) && c.ref !== fromRef)
    .slice(0, 3);

  const hydrated = chosen
    .map((c) => {
      const verse = verseMap.get(c.ref);
      return verse ? toResult(verse, c.reason, kind, c.confidence) : null;
    })
    .filter((c): c is ConnectionResult => c !== null);

  return applyQualityGateAndVerify(fromRef, arabicText, translation, kind, hydrated, opts);
}
