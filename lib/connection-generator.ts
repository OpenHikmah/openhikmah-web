import { callAI } from "@/lib/ai";
import { db } from "@/lib/db";
import { aiGenerations } from "@/lib/db/schema";
import { isValidRef, getVerses } from "@/lib/quran-corpus";
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

const KIND_INSTRUCTIONS: Record<EdgeKind, string> = {
  thematic:
    "Find 3 other Quran verses that share the same theological theme as the given verse. Focus on verses that reinforce or expand the same divine message.",
  root:
    "Find 3 other Quran verses that share a significant Arabic root word with the given verse. The shared root should carry meaning relevant to the verse's central message.",
  contrast:
    "Find 3 other Quran verses that present a contrasting theological concept to the given verse — opposing states such as ease/hardship, gratitude/ingratitude, mercy/punishment.",
};

const KIND_SELECTION: Record<EdgeKind, string> = {
  thematic:
    "Select the 3 candidates that most strongly share the same theological theme as the source verse — reinforcing or expanding the same divine message.",
  root:
    "Select the 3 candidates whose shared Arabic root carries meaning most relevant to the source verse's central message.",
  contrast:
    "Select the 3 candidates that present the clearest contrasting theological concept to the source verse — opposing states such as ease/hardship, gratitude/ingratitude, mercy/punishment.",
};

function buildPrompt(
  fromRef: string,
  arabicText: string,
  translation: string,
  kind: EdgeKind
): string {
  return `You are a classical Islamic scholar grounded in the Maturidi/Hanafi tradition (Ahl al-Sunnah wal-Jama'ah).

Given this Quran verse:
Reference: ${fromRef}
Arabic: ${arabicText}
Translation: ${translation}

Task: ${KIND_INSTRUCTIONS[kind]}

Rules:
- Return EXACTLY 3 different verses (not the source verse).
- Verse references must be real and accurate (format: surah:ayah, e.g. 2:255).
- Each reason must be one concise sentence explaining the ${kind} connection in classical Islamic terms.
- Maintain strict Tanzih (divine transcendence). Avoid Tashbih (anthropomorphism).
- Return ONLY a valid JSON array. No prose, no markdown, no explanation outside the JSON.

Output format:
[
  { "ref": "surah:ayah", "reason": "one-sentence theological justification" },
  { "ref": "surah:ayah", "reason": "one-sentence theological justification" },
  { "ref": "surah:ayah", "reason": "one-sentence theological justification" }
]`;
}

function parseRawConnections(text: string): Array<{ ref: string; reason: string }> {
  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (c): c is { ref: string; reason: string } =>
        c && typeof c.ref === "string" && typeof c.reason === "string"
    );
  } catch {
    return [];
  }
}

/**
 * Generates up to 3 validated, fully-hydrated connections for a source verse.
 * Returns an empty array if generation fails or nothing resolves.
 */
export async function generateConnections(
  fromRef: string,
  arabicText: string,
  translation: string,
  kind: EdgeKind
): Promise<ConnectionResult[]> {
  const model = process.env.ANTHROPIC_MODEL ?? null;
  const text = await callAI(buildPrompt(fromRef, arabicText, translation, kind));

  // Best-effort audit log — never fail generation because logging failed.
  try {
    await db.insert(aiGenerations).values({ fromRef, kind, model });
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

  return candidates
    .map((c) => {
      const verse = verseMap.get(c.ref);
      if (!verse) return null;
      const result: ConnectionResult = {
        surah: verse.surah,
        ayah: verse.ayah,
        ref: verse.ref,
        arabicText: verse.arabicText,
        translation: verse.translation,
        surahName: verse.surahName,
        surahNameArabic: verse.surahNameArabic,
        reason: c.reason,
        kind,
      };
      return result;
    })
    .filter((c): c is ConnectionResult => c !== null);
}

function buildSelectionPrompt(
  fromRef: string,
  arabicText: string,
  translation: string,
  kind: EdgeKind,
  candidates: Verse[]
): string {
  const list = candidates
    .map((v) => `- ${v.ref} — ${v.translation}`)
    .join("\n");

  return `You are a classical Islamic scholar grounded in the Maturidi/Hanafi tradition (Ahl al-Sunnah wal-Jama'ah).

Source verse:
Reference: ${fromRef}
Arabic: ${arabicText}
Translation: ${translation}

Below is a list of CANDIDATE verses, each pre-selected from canonical data as potentially related. Your task: ${KIND_SELECTION[kind]}

Candidates:
${list}

Rules:
- Choose ONLY from the candidate references listed above. Do NOT introduce any verse that is not in the list.
- Return at most 3, fewer if fewer are genuinely appropriate.
- Each reason must be one concise sentence explaining the ${kind} connection in classical Islamic terms.
- Maintain strict Tanzih (divine transcendence). Avoid Tashbih (anthropomorphism).
- Return ONLY a valid JSON array. No prose, no markdown, no explanation outside the JSON.

Output format:
[
  { "ref": "surah:ayah", "reason": "one-sentence theological justification" }
]`;
}

function toResult(verse: Verse, reason: string, kind: EdgeKind): ConnectionResult {
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
  };
}

/**
 * Grounded generation: the model SELECTS from real discovered candidates and
 * explains each. Refs are validated against the candidate set, so a verse the
 * discovery step did not surface can never appear. Returns [] if no candidate
 * verses resolve (caller falls back to legacy generation).
 */
export async function generateGroundedConnections(
  fromRef: string,
  arabicText: string,
  translation: string,
  kind: EdgeKind,
  candidateRefs: string[]
): Promise<ConnectionResult[]> {
  const verseMap = await getVerses(candidateRefs);
  const candidates = candidateRefs
    .map((ref) => verseMap.get(ref))
    .filter((v): v is Verse => v !== undefined && v.ref !== fromRef);
  if (candidates.length === 0) return [];

  const model = process.env.ANTHROPIC_MODEL ?? null;
  const text = await callAI(
    buildSelectionPrompt(fromRef, arabicText, translation, kind, candidates)
  );

  try {
    await db.insert(aiGenerations).values({ fromRef, kind, model });
  } catch (err) {
    console.error("ai_generations log failed:", err);
  }

  const allowed = new Set<string>(candidates.map((v) => v.ref));
  const chosen = parseRawConnections(text)
    .filter((c) => allowed.has(c.ref) && c.ref !== fromRef)
    .slice(0, 3);

  return chosen
    .map((c) => {
      const verse = verseMap.get(c.ref);
      return verse ? toResult(verse, c.reason, kind) : null;
    })
    .filter((c): c is ConnectionResult => c !== null);
}
