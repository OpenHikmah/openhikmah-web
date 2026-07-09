import { NextRequest, NextResponse } from "next/server";
import { similarVerses } from "@/lib/quran/semantic-search";
import { isValidRef } from "@/lib/quran/quran-corpus";

/**
 * Verses semantically nearest to a given verse (by embedding similarity).
 * Returns [] (200) when embeddings aren't seeded or the source has no vector,
 * so callers can treat "no similar verses" and "feature unavailable" uniformly.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ surah: string; ayah: string }> }
) {
  const { surah, ayah } = await params;
  const ref = `${parseInt(surah, 10)}:${parseInt(ayah, 10)}`;

  if (!isValidRef(ref)) {
    return NextResponse.json({ error: "Invalid reference" }, { status: 400 });
  }

  try {
    const matches = await similarVerses(ref, 5);
    return NextResponse.json(matches.map((m) => ({ verse: m.verse, similarity: m.similarity })));
  } catch (err) {
    console.error("Similar-verses route error:", err);
    return NextResponse.json([], { status: 200 });
  }
}
