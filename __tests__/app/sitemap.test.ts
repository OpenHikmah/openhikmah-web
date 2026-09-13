import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/stories/story-flags", () => ({
  getHiddenSlugs: vi.fn(() => Promise.resolve(new Set<string>())),
}));

import sitemap from "@/app/sitemap";
import { DIVINE_NAMES } from "@/lib/names/divine-names";
import { STORIES } from "@/lib/stories";
import { SURAH_NAMES } from "@/lib/quran/surah-names";
import { getHiddenSlugs } from "@/lib/stories/story-flags";

beforeEach(() => {
  vi.mocked(getHiddenSlugs).mockResolvedValue(new Set());
});

describe("sitemap", () => {
  it("includes the static routes", async () => {
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);
    for (const path of ["", "/names", "/stories", "/search", "/today", "/canvas"]) {
      expect(urls).toContain(`https://openhikmah.com${path}`);
    }
  });

  it("includes every divine name", async () => {
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);
    for (const name of DIVINE_NAMES) {
      expect(urls).toContain(`https://openhikmah.com/names/${name.slug}`);
    }
  });

  it("includes every visible story but excludes hidden ones", async () => {
    const hiddenSlug = STORIES[0].slug;
    vi.mocked(getHiddenSlugs).mockResolvedValue(new Set([hiddenSlug]));

    const entries = await sitemap();
    const urls = entries.map((e) => e.url);

    expect(urls).not.toContain(`https://openhikmah.com/stories/${hiddenSlug}`);
    for (const story of STORIES.slice(1)) {
      expect(urls).toContain(`https://openhikmah.com/stories/${story.slug}`);
    }
  });

  it("includes every surah", async () => {
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);
    for (const number of Object.keys(SURAH_NAMES)) {
      expect(urls).toContain(`https://openhikmah.com/surah/${number}`);
    }
  });
});
