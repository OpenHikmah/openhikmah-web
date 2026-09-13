import type { MetadataRoute } from "next";
import { DIVINE_NAMES } from "@/lib/names/divine-names";
import { listVisibleStories } from "@/lib/stories";
import { SURAH_NAMES } from "@/lib/quran/surah-names";

const BASE_URL = "https://openhikmah.com";

// listVisibleStories() hits Postgres for hidden-story flags; force-dynamic keeps
// that a request-time call instead of failing the production build (no DB there).
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const stories = await listVisibleStories();

  const staticRoutes = ["", "/names", "/stories", "/search", "/today", "/canvas"].map((path) => ({
    url: `${BASE_URL}${path}`,
  }));

  const nameRoutes = DIVINE_NAMES.map((name) => ({
    url: `${BASE_URL}/names/${name.slug}`,
  }));

  const storyRoutes = stories.map((story) => ({
    url: `${BASE_URL}/stories/${story.slug}`,
  }));

  const surahRoutes = Object.keys(SURAH_NAMES).map((number) => ({
    url: `${BASE_URL}/surah/${number}`,
  }));

  return [...staticRoutes, ...nameRoutes, ...storyRoutes, ...surahRoutes];
}
