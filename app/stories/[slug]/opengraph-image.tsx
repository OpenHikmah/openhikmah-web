import { ImageResponse } from "next/og";
import { getVisibleStoryBySlug } from "@/lib/stories";
import { renderOgCard, clampBody, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-card";

export const alt = "Prophetic Stories — Open Hikmah";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function Image({ params }: Props) {
  const { slug } = await params;
  const story = await getVisibleStoryBySlug(slug);

  if (!story) {
    return new ImageResponse(
      renderOgCard({
        eyebrow: "Open Hikmah",
        body: "Explore the Qur'an as a connected graph.",
        footer: "openhikmah.com",
      }),
      size
    );
  }

  return new ImageResponse(
    renderOgCard({
      eyebrow: "Prophetic Stories",
      title: story.name.en,
      body: clampBody(story.tagline.en),
    }),
    size
  );
}
