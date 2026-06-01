import { NextRequest, NextResponse } from "next/server";
import { resolveVerse } from "@/lib/verse-resolver";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ surah: string; ayah: string }> }
) {
  const { surah, ayah } = await params;
  const surahNum = parseInt(surah, 10);
  const ayahNum = parseInt(ayah, 10);

  if (!surahNum || !ayahNum || surahNum < 1 || surahNum > 114 || ayahNum < 1) {
    return NextResponse.json({ error: "Invalid reference" }, { status: 400 });
  }

  // Local corpus first, live fetch as fallback — see lib/verse-resolver.ts.
  const verse = await resolveVerse(`${surahNum}:${ayahNum}`);
  if (!verse) {
    return NextResponse.json({ error: "Verse not found" }, { status: 404 });
  }
  return NextResponse.json(verse);
}
