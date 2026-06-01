import { callAI } from "@/lib/ai";
import { db } from "@/lib/db";
import { aiGenerations } from "@/lib/db/schema";
import { isValidRef } from "@/lib/quran-corpus";
import { resolveVerse } from "@/lib/verse-resolver";
import type { ConnectionResult, EdgeKind } from "@/types/quran";

/**
 * The ONLY module that calls the AI. Generates verse connections for a cache
 * miss, then validates every returned reference by resolving it (rejecting
 * references the model invented) and logs the generation to `ai_generations`.
 */

const KIND_INSTRUCTIONS: Record<EdgeKind, string> = {
  thematic:
    "Find 3 other Quran verses that share the same theological theme as the given verse. Focus on verses that reinforce or expand the same divine message.",
  root:
    "Find 3 other Quran verses that share a significant Arabic root word with the given verse. The shared root should carry meaning relevant to the verse's central message.",
  contrast:
    "Find 3 other Quran verses that present a contrasting theological concept to the given verse — opposing states such as ease/hardship, gratitude/ingratitude, mercy/punishment.",
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

  // Resolve each ref — drops hallucinated references that resolve nowhere.
  const resolved = await Promise.all(candidates.map((c) => resolveVerse(c.ref)));

  return candidates
    .map((c, i) => {
      const verse = resolved[i];
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
