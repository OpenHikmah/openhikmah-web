import { NextRequest, NextResponse } from "next/server";
import { isValidRef } from "@/lib/quran/quran-corpus";
import { htmlToTafsirBlocks } from "@/lib/quran/tafsir";
import { clientKey } from "@/lib/infra/http";
import { rateLimitOrNull } from "@/lib/infra/rate-limit";

// English "Ibn Kathir (Abridged)" on the quran.com API. The previous source
// (alquran.cloud en.ibn-kathir) doesn't exist there and silently fell back to
// the plain Arabic Qur'an text, so the panel showed the verse, not tafsir (#54).
const IBN_KATHIR_EN = 169;

// Public, unauthenticated route that hits a third-party API on cache misses —
// rate limit per-IP so one caller can't amplify load onto api.quran.com.
const TAFSIR_LIMIT = 60;
const TAFSIR_WINDOW_SECONDS = 60;

/**
 * English Ibn Kathir tafsir for a verse, sourced from quran.com and returned as
 * ordered plain-text blocks (see lib/tafsir). Returns `{ blocks: [] }` (200) when
 * the verse has no tafsir or the upstream fails, so the UI degrades to "Tafsir
 * unavailable" rather than erroring.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ surah: string; ayah: string }> }
) {
  const limited = await rateLimitOrNull(
    `tafsir:${clientKey(req)}`,
    "Too many requests",
    TAFSIR_LIMIT,
    TAFSIR_WINDOW_SECONDS
  );
  if (limited) return limited;

  const { surah, ayah } = await params;
  const ref = `${parseInt(surah, 10)}:${parseInt(ayah, 10)}`;

  if (!isValidRef(ref)) {
    return NextResponse.json({ error: "Invalid reference" }, { status: 400 });
  }

  try {
    const res = await fetch(
      `https://api.quran.com/api/v4/tafsirs/${IBN_KATHIR_EN}/by_ayah/${ref}`,
      { next: { revalidate: 604800 } } // tafsir is static — cache for a week
    );
    if (!res.ok) return NextResponse.json({ blocks: [] }, { status: 200 });

    const json = (await res.json()) as { tafsir?: { text?: string } };
    const raw = json?.tafsir?.text?.trim();
    if (!raw) return NextResponse.json({ blocks: [] }, { status: 200 });

    return NextResponse.json({
      blocks: htmlToTafsirBlocks(raw),
      source: "Ibn Kathir (Abridged)",
    });
  } catch (err) {
    console.error(`Tafsir fetch failed for ${ref}:`, err);
    return NextResponse.json({ blocks: [] }, { status: 200 });
  }
}
