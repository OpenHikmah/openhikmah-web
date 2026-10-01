import { ImageResponse } from "next/og";
import { renderOgCard, clampBody, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-card";
import { loadSharePayload } from "@/lib/canvas/share-hydrate";
import { resolveVerse } from "@/lib/quran/verse-resolver";

export const alt = "Shared canvas — Open Hikmah";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const dynamic = "force-dynamic";

// A canvas's shared data never changes once inserted, so a hit can be cached
// forever; a miss/error is cached briefly in case the row appears shortly
// after (e.g. replication lag) rather than being stuck for a year.
const HIT_CACHE = { "Cache-Control": "public, immutable, no-transform, max-age=31536000" };
const MISS_CACHE = { "Cache-Control": "public, max-age=300" };

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const fallback = () =>
    new ImageResponse(
      renderOgCard({
        eyebrow: "Open Hikmah",
        body: "Explore the Qur'an as a connected graph.",
      }),
      { ...OG_SIZE, headers: MISS_CACHE }
    );

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) {
    return fallback();
  }

  const loaded = await loadSharePayload(id).catch((err) => {
    console.error("share opengraph-image load error:", err);
    return null;
  });
  if (loaded?.status !== "ok") return fallback();

  // Text comes from the corpus, never from the stored row, so the card cached
  // for a year can't carry client-supplied content.
  const count = loaded.payload.nodes.length;
  const first = await resolveVerse(loaded.payload.nodes[0].ref).catch((err) => {
    console.error("share opengraph-image verse error:", err);
    return null;
  });
  if (!first) return fallback();

  return new ImageResponse(
    renderOgCard({
      eyebrow: `${count} verse${count === 1 ? "" : "s"}`,
      refPill: first.ref,
      title: first.surahName,
      body: clampBody(first.translation),
    }),
    { ...OG_SIZE, headers: HIT_CACHE }
  );
}
