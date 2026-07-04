import { NextRequest, NextResponse } from "next/server";
import { callAI } from "@/lib/ai";
import { getNameBySlug, DIVINE_NAMES } from "@/lib/divine-names";
import { getOrGenerateNameContent } from "@/lib/name-content";

// Bump to force regeneration after a prompt change.
const PAIRINGS_VERSION = 1;

interface Pairing {
  name: string;
  transliteration: string;
  arabic: string;
  explanation: string;
}

function buildPrompt(transliteration: string, arabic: string, meaning: string): string {
  return `You are a classical Islamic scholar (Maturidi/Hanafi tradition).

The divine name ${transliteration} (${arabic}) means "${meaning}".

Task: Identify 2–3 other divine names from the 99 Names that most frequently appear paired with ${transliteration} in the Quran. For each, explain in ONE sentence why this pairing provides perfect theological balance in the specific contexts where they appear together.

Only include pairings where both names actually co-appear in the same verse or in closely related verses as documented in classical tafsir.

Return ONLY a JSON array:
[
  {
    "transliteration": "Ar-Rahim",
    "arabic": "الرَّحِيم",
    "explanation": "One sentence on why this pairing balances ${transliteration}."
  }
]`;
}

async function getPairings(slug: string): Promise<Pairing[]> {
  const name = getNameBySlug(slug);
  if (!name) return [];

  return getOrGenerateNameContent(
    slug,
    "pairings",
    PAIRINGS_VERSION,
    async () => {
      const text = await callAI(buildPrompt(name.transliteration, name.arabic, name.meaning));

      let raw: Array<{ transliteration: string; arabic: string; explanation: string }>;
      try {
        const match = text.match(/\[[\s\S]*\]/);
        if (!match) {
          console.error(`Pairings: no JSON array in AI response for ${slug}`);
          return [];
        }
        raw = JSON.parse(match[0]);
      } catch (err) {
        // Malformed AI JSON returns empty (not cached, so it retries) — but log it
        // so a persistently broken response is visible instead of a silent cost sink.
        console.error(`Pairings: failed to parse AI response for ${slug}:`, err);
        return [];
      }

      return raw.slice(0, 3).map((p) => {
        const match = DIVINE_NAMES.find(
          (n) =>
            n.transliteration.toLowerCase() === p.transliteration.toLowerCase() ||
            n.arabic === p.arabic
        );
        return {
          name: match?.slug ?? "",
          transliteration: p.transliteration,
          arabic: p.arabic,
          explanation: p.explanation,
        };
      });
    },
    (v) => v.length === 0
  );
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const name = getNameBySlug(slug);
  if (!name) {
    return NextResponse.json({ error: "Name not found" }, { status: 404 });
  }

  try {
    const pairings = await getPairings(slug);
    return NextResponse.json(pairings);
  } catch (err) {
    console.error("Pairings error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
