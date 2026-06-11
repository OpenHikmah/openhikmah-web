import { ImageResponse } from "next/og";
import { db } from "@/lib/db";
import { sharedCanvases } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { renderOgCard, clampBody, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-card";
import type { SavedCanvas } from "@/store/canvas";

export const alt = "Shared canvas — Open Hikmah";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const dynamic = "force-dynamic";

export default async function Image({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const fallback = () =>
    new ImageResponse(
      renderOgCard({
        eyebrow: "Open Hikmah",
        body: "Explore the Qur'an as a connected graph.",
      }),
      { ...OG_SIZE }
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

  const canvas = JSON.parse(rows[0].data) as SavedCanvas;
  if (!canvas?.nodes?.length) return fallback();

  const first = canvas.nodes[0];
  const count = canvas.nodes.length;

  return new ImageResponse(
    renderOgCard({
      eyebrow: `${count} verse${count === 1 ? "" : "s"}`,
      refPill: first.verse.ref,
      title: first.verse.surahName,
      body: clampBody(first.verse.translation),
    }),
    { ...OG_SIZE }
  );
}
