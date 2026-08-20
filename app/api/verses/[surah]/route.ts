import { NextRequest, NextResponse } from "next/server";
import { getSurahVerses } from "@/lib/quran/quran-corpus";
import { getQuranEdition } from "@/lib/i18n/request-prefs";

// The response varies on the oh_edition cookie, so it can't be a shared/static
// cache entry across locales.
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ surah: string }> }) {
  const { surah } = await params;
  if (!/^\d+$/.test(surah)) {
    return NextResponse.json({ error: "Invalid surah" }, { status: 400 });
  }
  const surahNum = parseInt(surah, 10);

  if (surahNum < 1 || surahNum > 114) {
    return NextResponse.json({ error: "Invalid surah" }, { status: 400 });
  }

  const edition = await getQuranEdition();
  const verses = await getSurahVerses(surahNum, edition);

  return NextResponse.json(verses);
}
