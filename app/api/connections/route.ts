import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import type { ConnectionResult, EdgeKind, VerseRef } from "@/types/quran";
import { getSurahName } from "@/lib/surah-names";

const client = new Anthropic();

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

async function fetchVerseData(ref: string): Promise<{
  arabicText: string;
  translation: string;
  surahName: string;
  surahNameArabic: string;
} | null> {
  const [surahStr, ayahStr] = ref.split(":");
  const surahNum = parseInt(surahStr, 10);
  const ayahNum = parseInt(ayahStr, 10);

  if (!surahNum || !ayahNum || surahNum < 1 || surahNum > 114 || ayahNum < 1) {
    return null;
  }

  try {
    const [arabicRes, translationRes] = await Promise.all([
      fetch(
        `https://api.alquran.cloud/v1/ayah/${surahNum}:${ayahNum}/ar.alafasy`,
        { next: { revalidate: 86400 } }
      ),
      fetch(
        `https://api.alquran.cloud/v1/ayah/${surahNum}:${ayahNum}/en.sahih`,
        { next: { revalidate: 86400 } }
      ),
    ]);

    if (!arabicRes.ok || !translationRes.ok) return null;

    const [arabicData, translationData] = await Promise.all([
      arabicRes.json(),
      translationRes.json(),
    ]);

    const [surahName, surahNameArabic] = getSurahName(surahNum);

    return {
      arabicText: arabicData.data.text,
      translation: translationData.data.text,
      surahName,
      surahNameArabic,
    };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  let body: { fromRef?: string; kind?: string; arabicText?: string; translation?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { fromRef, kind, arabicText, translation } = body;

  if (!fromRef || !kind || !arabicText || !translation) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  if (!["thematic", "root", "contrast"].includes(kind)) {
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  }

  const edgeKind = kind as EdgeKind;

  try {
    const message = await client.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 1024,
      thinking: { type: "adaptive" },
      messages: [
        {
          role: "user",
          content: buildPrompt(fromRef, arabicText, translation, edgeKind),
        },
      ],
    });

    const textContent = message.content.find((b) => b.type === "text");
    if (!textContent || textContent.type !== "text") {
      return NextResponse.json({ error: "No response from AI" }, { status: 500 });
    }

    let rawConnections: Array<{ ref: string; reason: string }>;
    try {
      const jsonMatch = textContent.text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error("No JSON array found");
      rawConnections = JSON.parse(jsonMatch[0]);
    } catch {
      return NextResponse.json(
        { error: "Failed to parse AI response" },
        { status: 500 }
      );
    }

    const verseDataResults = await Promise.all(
      rawConnections.slice(0, 3).map((c) => fetchVerseData(c.ref))
    );

    const connections: ConnectionResult[] = rawConnections
      .slice(0, 3)
      .map((c, i) => {
        const verseData = verseDataResults[i];
        if (!verseData) return null;

        const [surahStr, ayahStr] = c.ref.split(":");
        return {
          ref: c.ref as VerseRef,
          arabicText: verseData.arabicText,
          translation: verseData.translation,
          surahName: verseData.surahName,
          surahNameArabic: verseData.surahNameArabic,
          reason: c.reason,
          kind: edgeKind,
          surah: parseInt(surahStr, 10),
          ayah: parseInt(ayahStr, 10),
        } satisfies ConnectionResult;
      })
      .filter((c): c is ConnectionResult => c !== null);

    if (connections.length === 0) {
      return NextResponse.json({ error: "Could not resolve any verses" }, { status: 500 });
    }

    return NextResponse.json(connections);
  } catch (err) {
    console.error("Connections route error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
