import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
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
