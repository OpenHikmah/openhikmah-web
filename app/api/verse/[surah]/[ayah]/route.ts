import { NextRequest, NextResponse } from "next/server";
import { resolveVerse } from "@/lib/quran/verse-resolver";
import { getQuranEdition } from "@/lib/i18n/request-prefs";

// The response varies on the oh_edition cookie, so it can't be a shared/static
// cache entry across locales.
export const dynamic = "force-dynamic";

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
  const edition = await getQuranEdition();
  const verse = await resolveVerse(`${surahNum}:${ayahNum}`, edition);
  if (!verse) {
    return NextResponse.json({ error: "Verse not found" }, { status: 404 });
  }
  return NextResponse.json(verse);
}
