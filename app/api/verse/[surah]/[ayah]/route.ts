import { NextRequest, NextResponse } from "next/server";
import { resolveVerse } from "@/lib/quran/verse-resolver";
import { isValidRef } from "@/lib/quran/quran-corpus";
import { getQuranEdition } from "@/lib/i18n/request-prefs";

// The response varies on the oh_edition cookie, so it can't be a shared/static
// cache entry across locales.
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ surah: string; ayah: string }> }
) {
  const { surah, ayah } = await params;
  const ref = `${parseInt(surah, 10)}:${parseInt(ayah, 10)}`;

  // Single gate for every ref-accepting endpoint: surah 1–114 and ayah within
  // that surah's real length (so "1:8" is a fast 400, not a live round-trip).
  if (!isValidRef(ref)) {
    return NextResponse.json({ error: "Invalid reference" }, { status: 400 });
  }

  // Local corpus first, live fetch as fallback — see lib/verse-resolver.ts.
  const edition = await getQuranEdition();
  const verse = await resolveVerse(ref, edition);
  if (!verse) {
    return NextResponse.json({ error: "Verse not found" }, { status: 404 });
  }
  return NextResponse.json(verse);
}
