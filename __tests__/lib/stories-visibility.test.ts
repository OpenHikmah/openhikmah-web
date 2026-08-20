import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/stories/story-flags", () => ({
  getHiddenSlugs: vi.fn(() => Promise.resolve(new Set<string>())),
}));

import { STORIES, listVisibleStories, getVisibleStoryBySlug } from "@/lib/stories";
import { getHiddenSlugs } from "@/lib/stories/story-flags";

const realSlug = STORIES[0].slug;

beforeEach(() => {
  vi.mocked(getHiddenSlugs).mockResolvedValue(new Set());
});

describe("listVisibleStories", () => {
  it("returns every story when nothing is flagged", async () => {
    const stories = await listVisibleStories();
    expect(stories).toHaveLength(STORIES.length);
  });

  it("excludes a flagged slug", async () => {
    vi.mocked(getHiddenSlugs).mockResolvedValue(new Set([realSlug]));
    const stories = await listVisibleStories();
    expect(stories.find((s) => s.slug === realSlug)).toBeUndefined();
    expect(stories).toHaveLength(STORIES.length - 1);
  });
});

describe("getVisibleStoryBySlug", () => {
  it("returns the story when it isn't flagged", async () => {
    const story = await getVisibleStoryBySlug(realSlug);
    expect(story?.slug).toBe(realSlug);
  });

  it("returns undefined for a flagged slug", async () => {
    vi.mocked(getHiddenSlugs).mockResolvedValue(new Set([realSlug]));
    const story = await getVisibleStoryBySlug(realSlug);
    expect(story).toBeUndefined();
  });

  it("returns undefined for an unknown slug regardless of flags", async () => {
    const story = await getVisibleStoryBySlug("not-a-real-prophet");
    expect(story).toBeUndefined();
  });
});
