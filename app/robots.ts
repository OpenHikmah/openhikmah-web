import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      // The shared-canvas card image lives under /api/ (referenced by the canvas
      // page's openGraph/twitter metadata); unfurlers must be able to fetch it.
      // The longer, more specific Allow wins over `Disallow: /api/`.
      allow: ["/", "/api/share/*/opengraph-image"],
      disallow: [
        "/api/",
        "/admin/",
        "/callback",
        "/bookmarks",
        "/settings",
        "/social",
        "/mentions",
        "/workspaces",
        "/onboarding",
      ],
    },
    sitemap: "https://openhikmah.com/sitemap.xml",
  };
}
