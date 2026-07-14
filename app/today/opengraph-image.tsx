import { ImageResponse } from "next/og";
import { getVerseOfDay } from "@/lib/quran/verse-of-day";
import { renderOgCard, clampBody, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-card";

export const alt = "Verse of the Day — Open Hikmah";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

// Match the /today page: render per request so the card shows the current UTC
// day's verse instead of freezing to whatever was picked at build time.
export const dynamic = "force-dynamic";

// Runs in the Node runtime (default) so the verse DB read works.
//
// The verse only changes once per UTC day, so the response is cached at the
// edge for an hour (and served stale for up to a day while revalidating)
// instead of hitting the DB on every crawler/browser fetch.
const CACHE_HEADERS = { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" };

export default async function Image() {
  const verse = await getVerseOfDay().catch(() => null);

  if (!verse) {
    return new ImageResponse(
      renderOgCard({
        eyebrow: "Open Hikmah",
        body: "Explore the Qur'an as a connected graph.",
        footer: "openhikmah.com",
      }),
      { ...size, headers: CACHE_HEADERS }
    );
  }

  return new ImageResponse(
    renderOgCard({
      eyebrow: "Verse of the Day",
      refPill: verse.ref,
      title: verse.surahName,
      body: clampBody(verse.translation),
    }),
    { ...size, headers: CACHE_HEADERS }
  );
}
