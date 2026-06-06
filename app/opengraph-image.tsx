import { ImageResponse } from "next/og";
import { renderOgCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-card";

export const alt = "Open Hikmah — the Qur'an as a connected graph";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

// Default share card for the site (home, and shared `/?share=` links unless a more
// specific image overrides it).
export default function Image() {
  return new ImageResponse(
    renderOgCard({
      eyebrow: "Open Hikmah",
      body: "Explore the Qur'an as a connected graph — shared roots, themes, and contrasts.",
      footer: "openhikmah.com",
    }),
    { ...size }
  );
}
