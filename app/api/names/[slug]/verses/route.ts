import { NextRequest, NextResponse } from "next/server";
import { callAI } from "@/lib/ai/ai";
import { getNameBySlug } from "@/lib/names/divine-names";
import { isValidRef } from "@/lib/quran/quran-corpus";
import { resolveVerse } from "@/lib/quran/verse-resolver";
import { getOrGenerateNameContent } from "@/lib/names/name-content";
import { consume, RateLimitError } from "@/lib/infra/rate-limit";
import { clientKey } from "@/lib/infra/http";
import { incr } from "@/lib/infra/metrics";
import sanitizeHtml from "sanitize-html";
import type { VerseRef } from "@/types/quran";

// Bump to force regeneration after a prompt/search change.
const VERSES_VERSION = 2;

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
  if (!isValidRef(ref)) return null;
  const verse = await resolveVerse(ref);
  if (!verse) {
    // resolveVerse already logs the underlying corpus/live-fetch failure —
    // this just keeps the metric so an upstream outage stays visible on
    // /api/metrics, not silent.
    incr("quran_api_fetch_error");
    return null;
  }
  return verse;
}

// Search quran.com for verses containing this name's Arabic text
async function searchVerseRefs(arabic: string): Promise<string[]> {
  try {
    const url = `https://api.quran.com/api/v4/search?q=${encodeURIComponent(arabic)}&size=8&language=en&page=1`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: 86400 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const results = (data?.search?.results ?? []) as Array<{ verse_key?: string }>;
    return results
      .filter((r) => r.verse_key && /^\d+:\d+$/.test(r.verse_key))
      .map((r) => r.verse_key as string)
      .slice(0, 5);
  } catch (err) {
    // Same reasoning as fetchVerseData: a failed search must be distinguishable
    // from "genuinely no matching verses" in logs and /api/metrics.
    console.error(`Name verses: quran.com search failed for "${arabic}":`, err);
    incr("quran_search_api_error");
    return [];
  }
}

// Generate AI reasons for why each verse is connected to this name
async function buildReasons(
  refs: string[],
  transliteration: string,
  meaning: string
): Promise<Map<string, string>> {
  if (refs.length === 0) return new Map();
  const prompt = `You are a classical Islamic scholar (Maturidi/Hanafi tradition).

Divine name: ${transliteration} — "${meaning}"

For each verse reference below, write ONE concise sentence (max 20 words) explaining how this verse manifests or relates to this divine name.
Maintain strict Tanzih. Return ONLY a JSON object mapping ref → reason.

Refs: ${refs.join(", ")}

Output format:
{ "surah:ayah": "one sentence", ... }`;

  try {
    const text = await callAI(prompt);
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return new Map();
    const obj: unknown = JSON.parse(match[0]);
    if (typeof obj !== "object" || obj === null || Array.isArray(obj)) return new Map();
    return new Map(
      Object.entries(obj).filter((e): e is [string, string] => typeof e[1] === "string")
    );
  } catch (err) {
    // Reasons are best-effort (a default reason is used per verse if missing) —
    // log so a persistently malformed AI response is visible, not silent.
    console.error(`Name verses: failed to parse AI reasons for ${transliteration}:`, err);
    return new Map();
  }
}

// Fallback: AI-only verse finding (used when search returns no results)
async function fallbackAIVerses(
  arabic: string,
  transliteration: string,
  meaning: string,
  description: string
): Promise<Array<{ ref: string; reason: string }>> {
  const prompt = `You are a classical Islamic scholar (Maturidi/Hanafi tradition).

The divine name ${transliteration} (${arabic}) means "${meaning}".
Context: ${description}

Find exactly 5 Quran verse references where this name's Arabic root appears or the verse concludes with a form of this name.
Return ONLY a JSON array:
[{ "ref": "surah:ayah", "reason": "one sentence" }, ...]`;

  try {
    const text = await callAI(prompt);
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return [];
    const raw: unknown = JSON.parse(match[0]);
    // The model proposes refs from memory here — validate shape AND that each
    // ref is a real Quran reference before anything downstream touches it.
    return (Array.isArray(raw) ? raw : []).filter(
      (item): item is { ref: string; reason: string } =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as Record<string, unknown>).ref === "string" &&
        isValidRef((item as Record<string, unknown>).ref as string) &&
        typeof (item as Record<string, unknown>).reason === "string"
    );
  } catch (err) {
    // Empty result is not cached (it retries), but log the parse failure so a
    // broken prompt surfaces instead of silently re-invoking the AI forever.
    console.error(`Name verses: AI fallback failed for ${transliteration}:`, err);
    return [];
  }
}

function stripHtml(text: string): string {
  return sanitizeHtml(text, { allowedTags: [], allowedAttributes: {} });
}

async function getVersesBySlug(
  slug: string,
  onBeforeGenerate: () => Promise<void>
): Promise<NameVerse[]> {
  const name = getNameBySlug(slug);
  if (!name) return [];

  return getOrGenerateNameContent(
    slug,
    "verses",
    VERSES_VERSION,
    async (): Promise<NameVerse[]> => {
      // Try actual quran.com search first
      const refs = await searchVerseRefs(name.arabic);

      // If search found results, fetch verse data + AI reasons
      if (refs.length > 0) {
        const [verseDataResults, reasonMap] = await Promise.all([
          Promise.all(refs.map((ref) => fetchVerseData(ref))),
          buildReasons(refs, name.transliteration, name.meaning),
        ]);

        const verses: NameVerse[] = refs
          .map((ref, i) => {
            const vd = verseDataResults[i];
            if (!vd) return null;
            return {
              ...vd,
              translation: stripHtml(vd.translation),
              reason: reasonMap.get(ref) ?? `Contains a form of ${name.transliteration}.`,
            } as NameVerse;
          })
          .filter((v): v is NameVerse => v !== null);

        if (verses.length > 0) return verses;
      }

      // Fallback: pure AI verse selection
      const aiItems = await fallbackAIVerses(
        name.arabic,
        name.transliteration,
        name.meaning,
        name.description
      );
      if (aiItems.length === 0) return [];

      const verseDataResults = await Promise.all(
        aiItems.slice(0, 5).map((item) => fetchVerseData(item.ref))
      );
      return aiItems
        .slice(0, 5)
        .map((item, i) => {
          const vd = verseDataResults[i];
          if (!vd) return null;
          return { ...vd, reason: item.reason } as NameVerse;
        })
        .filter((v): v is NameVerse => v !== null);
    },
    (v) => v.length === 0,
    onBeforeGenerate
  );
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const name = getNameBySlug(slug);
  if (!name) {
    return NextResponse.json({ error: "Name not found" }, { status: 404 });
  }

  try {
    const verses = await getVersesBySlug(slug, async () => {
      if (!(await consume(`names-gen:${clientKey(req)}`))) throw new RateLimitError();
    });
    return NextResponse.json(verses);
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json({ error: "Too many requests — please slow down." }, { status: 429 });
    }
    console.error("Name verses error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
