import { NextRequest, NextResponse } from "next/server";
import type { SearchResult, VerseRef } from "@/types/quran";
import { getSurahName } from "@/lib/surah-names";
import { searchByMeaning } from "@/lib/semantic-search";
import { consume } from "@/lib/rate-limit";
import { clientKey } from "@/lib/http";
import sanitizeHtml from "sanitize-html";

/** Keyword search via the quran.com full-text API. Returns [] on any failure. */
async function keywordSearch(q: string): Promise<SearchResult[]> {
  try {
    const url = `https://api.quran.com/api/v4/search?q=${encodeURIComponent(q)}&size=10&language=en&page=1`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: 300 },
    });
    if (!res.ok) {
      console.error(`Search API error: ${res.status} ${res.statusText}`);
      return [];
    }
    const data = await res.json();
    return (data?.search?.results ?? [])
      .filter((r: { verse_key?: string }) => r.verse_key && /^\d+:\d+$/.test(r.verse_key))
      .map((r: { verse_key: string; translations?: Array<{ text?: string }> }) => {
        const [surahStr] = r.verse_key.split(":");
        const surahNum = parseInt(surahStr, 10);
        const [surahName, surahNameArabic] = getSurahName(surahNum);
        const snippet = sanitizeHtml(r.translations?.[0]?.text ?? "", {
          allowedTags: [],
          allowedAttributes: {},
        }).slice(0, 140);
        return { ref: r.verse_key as VerseRef, surahName, surahNameArabic, snippet } satisfies SearchResult;
      });
  } catch (err) {
    console.error("Keyword search error:", err);
    return [];
  }
}

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

  // Semantic ("by meaning") mode — ranks the local corpus by embedding similarity.
  // It can come up empty for benign reasons: embeddings not yet seeded, the embedding
  // provider unavailable, the free-tier quota exhausted, or this caller hitting the
  // per-IP limit. In all of those we fall back to free keyword search so "by meaning"
  // is never blank, and it self-upgrades to true semantic results once embeddings exist.
  if (req.nextUrl.searchParams.get("mode") === "meaning") {
    // The embedding call costs quota, so rate-limit it per client IP (keyword is free).
    const allowed = await consume(`search:${clientKey(req)}`);
    if (allowed) {
      try {
        const matches = await searchByMeaning(q, 10);
        if (matches.length > 0) {
          const results: SearchResult[] = matches.map((m) => ({
            ref: m.verse.ref,
            surahName: m.verse.surahName,
            surahNameArabic: m.verse.surahNameArabic,
            snippet: m.verse.translation.slice(0, 140),
          }));
          return NextResponse.json(results);
        }
      } catch (err) {
        console.error("Semantic search route error:", err);
      }
    }
    // No semantic results (empty / error / rate-limited) → keyword fallback.
    const results = await keywordSearch(q);
    return NextResponse.json(results, { headers: { "x-search-fallback": "keyword" } });
  }

  return NextResponse.json(await keywordSearch(q));
}
