import { ImageResponse } from "next/og";
import { db } from "@/lib/infra/db";
import { sharedCanvases } from "@/lib/infra/db/schema";
import { eq } from "drizzle-orm";
import { renderOgCard, clampBody, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-card";
import { isValidNode } from "@/lib/canvas/share-canvas";
import type { SavedCanvas } from "@/store/canvas";

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

  const rows = await db
    .select()
    .from(sharedCanvases)
    .where(eq(sharedCanvases.id, id))
    .limit(1)
    .catch(() => []);

  if (!rows[0]) return fallback();

  let canvas: SavedCanvas;
  try {
    canvas = JSON.parse(rows[0].data) as SavedCanvas;
  } catch (err) {
    console.error("share opengraph-image parse error:", err);
    return fallback();
  }
  if (!canvas?.nodes?.length) return fallback();

  const first = canvas.nodes[0];
  const count = canvas.nodes.length;
  if (!isValidNode(first)) return fallback();

  return new ImageResponse(
    renderOgCard({
      eyebrow: `${count} verse${count === 1 ? "" : "s"}`,
      refPill: first.verse.ref,
      title: first.verse.surahName,
      body: clampBody(first.verse.translation),
    }),
    { ...OG_SIZE, headers: HIT_CACHE }
  );
}
