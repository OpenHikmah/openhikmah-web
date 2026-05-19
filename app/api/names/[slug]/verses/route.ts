import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { unstable_cache } from "next/cache";
import { getNameBySlug } from "@/lib/divine-names";
import { getSurahName } from "@/lib/surah-names";
import type { VerseRef } from "@/types/quran";

const client = new Anthropic();

interface NameVerse {
  ref: VerseRef;
  surah: number;
  ayah: number;
  arabicText: string;
  translation: string;
  surahName: string;
  surahNameArabic: string;
  reason: string;
}

async function fetchVerseData(ref: string): Promise<Omit<NameVerse, "reason"> | null> {
  const [surahStr, ayahStr] = ref.split(":");
  const surahNum = parseInt(surahStr, 10);
  const ayahNum = parseInt(ayahStr, 10);
  if (!surahNum || !ayahNum || surahNum < 1 || surahNum > 114 || ayahNum < 1) return null;

  try {
    const [arabicRes, translationRes] = await Promise.all([
      fetch(`https://api.alquran.cloud/v1/ayah/${surahNum}:${ayahNum}/ar.alafasy`),
      fetch(`https://api.alquran.cloud/v1/ayah/${surahNum}:${ayahNum}/en.sahih`),
    ]);
    if (!arabicRes.ok || !translationRes.ok) return null;
    const [arabicData, translationData] = await Promise.all([arabicRes.json(), translationRes.json()]);
    const [surahName, surahNameArabic] = getSurahName(surahNum);
    return {
      ref: ref as VerseRef,
      surah: surahNum,
      ayah: ayahNum,
      arabicText: arabicData.data.text,
      translation: translationData.data.text,
      surahName,
      surahNameArabic,
    };
  } catch {
    return null;
  }
}

function buildPrompt(arabic: string, transliteration: string, meaning: string, description: string): string {
  return `You are a classical Islamic scholar grounded in the Maturidi/Hanafi tradition.

The divine name ${transliteration} (${arabic}) means "${meaning}".
Theological description: ${description}

Task: Find exactly 5 Quran verses that most directly manifest or illustrate this divine attribute.
Prioritise verses that explicitly use a form of this name's root or that describe Allah acting through this attribute.

Rules:
- Return EXACTLY 5 different verse references.
- Each reason must be one concise sentence grounding the verse in the named attribute.
- Maintain strict Tanzih. No anthropomorphism.
- Return ONLY a valid JSON array. No prose outside the JSON.

Output format:
[
  { "ref": "surah:ayah", "reason": "one-sentence explanation" },
  { "ref": "surah:ayah", "reason": "one-sentence explanation" },
  { "ref": "surah:ayah", "reason": "one-sentence explanation" },
  { "ref": "surah:ayah", "reason": "one-sentence explanation" },
  { "ref": "surah:ayah", "reason": "one-sentence explanation" }
]`;
}

const getVersesBySlug = unstable_cache(
  async (slug: string): Promise<NameVerse[]> => {
    const name = getNameBySlug(slug);
    if (!name) return [];

    const message = await client.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      messages: [
        {
          role: "user",
          content: buildPrompt(name.arabic, name.transliteration, name.meaning, name.description),
        },
      ],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") return [];

    let rawItems: Array<{ ref: string; reason: string }>;
    try {
      const match = textBlock.text.match(/\[[\s\S]*\]/);
      if (!match) return [];
      rawItems = JSON.parse(match[0]);
    } catch {
      return [];
    }

    const verseDataResults = await Promise.all(rawItems.slice(0, 5).map((item) => fetchVerseData(item.ref)));

    return rawItems
      .slice(0, 5)
      .map((item, i) => {
        const vd = verseDataResults[i];
        if (!vd) return null;
        return { ...vd, reason: item.reason } as NameVerse;
      })
      .filter((v): v is NameVerse => v !== null);
  },
  ["name-verses-v1"],
  { revalidate: 86400 * 7 }
);

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const name = getNameBySlug(slug);
  if (!name) {
    return NextResponse.json({ error: "Name not found" }, { status: 404 });
  }

  try {
    const verses = await getVersesBySlug(slug);
    return NextResponse.json(verses);
  } catch (err) {
    console.error("Name verses error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
