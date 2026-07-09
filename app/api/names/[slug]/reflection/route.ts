import { NextRequest, NextResponse } from "next/server";
import { callAI } from "@/lib/ai/ai";
import { getNameBySlug } from "@/lib/names/divine-names";
import { getOrGenerateNameContent } from "@/lib/names/name-content";

// Bump to force regeneration after a prompt change.
const REFLECTION_VERSION = 1;

function buildPrompt(
  arabic: string,
  transliteration: string,
  meaning: string,
  description: string
): string {
  return `You are a classical Islamic scholar grounded in the Maturidi/Hanafi tradition (Ahl al-Sunnah wal-Jama'ah).

The divine name ${transliteration} (${arabic}) means "${meaning}".
Theological context: ${description}

Task: Write a "Believer's Reflection" — a single paragraph (3–5 sentences) describing the orthodox Maturidi/Hanafi framework for how a believer internalises and realises this divine name in their own life.

Critical rules:
1. NEVER equate the divine attribute directly to a human action or quality.
2. ALWAYS maintain strict Tanzih — the attribute belongs exclusively and infinitely to Allah.
3. Frame the reflection as the believer's RESPONSE to the name, not a possession of it.
4. Use the language of trust (tawakkul), striving (sa'y), and certainty (yaqin) as appropriate.
5. Keep the tone reverent, orthodox, and practically grounded.
6. Return ONLY the paragraph — no title, no labels, no JSON, just the reflection text.

Example for Al-Razzaq: "The believer's realisation of Al-Razzaq is not to claim any power over provision, but to strive with full effort in lawful means while maintaining absolute certainty in the heart that the outcome belongs solely to Allah. The servant plants, waters, and labours — yet knows that it is Allah who causes the grain to grow."`;
}

async function getReflection(slug: string): Promise<string> {
  const name = getNameBySlug(slug);
  if (!name) return "";
  return getOrGenerateNameContent(
    slug,
    "reflection",
    REFLECTION_VERSION,
    () => callAI(buildPrompt(name.arabic, name.transliteration, name.meaning, name.description)),
    (s) => s.trim() === ""
  );
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const name = getNameBySlug(slug);
  if (!name) {
    return NextResponse.json({ error: "Name not found" }, { status: 404 });
  }

  try {
    const reflection = await getReflection(slug);
    return NextResponse.json({ reflection });
  } catch (err) {
    console.error("Reflection error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
