import type { Metadata } from "next";
import { CanvasPageClient } from "./CanvasPageClient";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type Props = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = await searchParams;
  const shareId = typeof params.share === "string" ? params.share : undefined;

  if (shareId && UUID_RE.test(shareId)) {
    return {
      openGraph: {
        images: [`/api/share/${shareId}/opengraph-image`],
      },
      twitter: {
        card: "summary_large_image",
        images: [`/api/share/${shareId}/opengraph-image`],
      },
    };
  }

  return {};
}

export default function CanvasPage() {
  return <CanvasPageClient />;
}
