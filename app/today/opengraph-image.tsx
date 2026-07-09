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
export default async function Image() {
  const verse = await getVerseOfDay().catch(() => null);

  if (!verse) {
    return new ImageResponse(
      renderOgCard({
        eyebrow: "Open Hikmah",
        body: "Explore the Qur'an as a connected graph.",
        footer: "openhikmah.com",
      }),
      { ...size }
    );
  }

  return new ImageResponse(
    renderOgCard({
      eyebrow: "Verse of the Day",
      refPill: verse.ref,
      title: verse.surahName,
      body: clampBody(verse.translation),
    }),
    { ...size }
  );
}
