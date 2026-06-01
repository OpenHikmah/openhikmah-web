import { NextRequest, NextResponse } from "next/server";
import type { SearchResult, VerseRef } from "@/types/quran";
import { getSurahName } from "@/lib/surah-names";
import { searchByMeaning } from "@/lib/semantic-search";
import sanitizeHtml from "sanitize-html";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();

  if (!q) {
    return NextResponse.json({ error: "Missing query" }, { status: 400 });
  }

  if (/^\d+:\d+$/.test(q)) {
    const [surahStr, ayahStr] = q.split(":");
    const surahNum = parseInt(surahStr, 10);
    const ayahNum = parseInt(ayahStr, 10);
    const [surahName, surahNameArabic] = getSurahName(surahNum);

    const result: SearchResult = {
      ref: q as VerseRef,
      surahName,
      surahNameArabic,
      snippet: `${surahName} ${ayahNum}`,
    };
    return NextResponse.json([result]);
  }

  // Semantic ("by meaning") mode — ranks the local corpus by embedding
  // similarity. Degrades gracefully to [] if embeddings aren't seeded or the
  // embedding provider is unavailable, mirroring the keyword path's resilience.
  if (req.nextUrl.searchParams.get("mode") === "meaning") {
    try {
      const matches = await searchByMeaning(q, 10);
      const results: SearchResult[] = matches.map((m) => ({
        ref: m.verse.ref,
        surahName: m.verse.surahName,
        surahNameArabic: m.verse.surahNameArabic,
        snippet: m.verse.translation.slice(0, 140),
      }));
      return NextResponse.json(results);
    } catch (err) {
      console.error("Semantic search route error:", err);
      return NextResponse.json([], { status: 200 });
    }
  }

  try {
    const url = `https://api.quran.com/api/v4/search?q=${encodeURIComponent(q)}&size=10&language=en&page=1`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: 300 },
    });

    if (!res.ok) {
      console.error(`Search API error: ${res.status} ${res.statusText}`);
      return NextResponse.json([], { status: 200 });
    }

    const data = await res.json();
    const results: SearchResult[] = (data?.search?.results ?? [])
      .filter(
        (r: { verse_key?: string }) =>
          r.verse_key && /^\d+:\d+$/.test(r.verse_key)
      )
      .map(
        (r: {
          verse_key: string;
          translations?: Array<{ text?: string }>;
        }) => {
          const [surahStr] = r.verse_key.split(":");
          const surahNum = parseInt(surahStr, 10);
          const [surahName, surahNameArabic] = getSurahName(surahNum);

          const rawSnippet = r.translations?.[0]?.text ?? "";
          const snippet = sanitizeHtml(rawSnippet, {
            allowedTags: [],
            allowedAttributes: {},
          }).slice(0, 140);

          return {
            ref: r.verse_key as VerseRef,
            surahName,
            surahNameArabic,
            snippet,
          } satisfies SearchResult;
        }
      );

    return NextResponse.json(results);
  } catch (err) {
    console.error("Search route error:", err);
    return NextResponse.json([], { status: 200 });
  }
}
