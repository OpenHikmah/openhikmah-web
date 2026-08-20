import { NextRequest, NextResponse } from "next/server";
import { getVerses } from "@/lib/quran/quran-corpus";
import { SURAH_LENGTHS } from "@/lib/quran/audio";
import { getQuranEdition } from "@/lib/i18n/request-prefs";
import type { Verse } from "@/types/quran";

// The response varies on the oh_edition cookie, so it can't be a shared/static
// cache entry across locales.
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ surah: string }> }
) {
  const { surah } = await params;
  const surahNum = parseInt(surah, 10);

  if (!surahNum || surahNum < 1 || surahNum > 114) {
    return NextResponse.json({ error: "Invalid surah" }, { status: 400 });
  }

  const ayahCount = SURAH_LENGTHS[surahNum - 1];
  const refs = Array.from({ length: ayahCount }, (_, i) => `${surahNum}:${i + 1}`);

  const edition = await getQuranEdition();
  const verseMap = await getVerses(refs, edition);
  const verses: Verse[] = refs
    .map((ref) => verseMap.get(ref))
    .filter((v): v is Verse => v !== undefined);

  return NextResponse.json(verses);
}
