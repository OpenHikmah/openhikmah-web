import { describe, it, expect } from "vitest";
import { STORIES, getStoryBySlug, listStories, resolveLocalized } from "@/lib/stories";
import { isValidRef } from "@/lib/quran/quran-corpus";
import { getNameBySlug } from "@/lib/names/divine-names";

describe("STORIES", () => {
  it("ships the launch set of 11 stories", () => {
    expect(STORIES).toHaveLength(11);
    expect(new Set(STORIES.map((s) => s.slug))).toEqual(
      new Set([
        "adam",
        "ayyub",
        "ibrahim",
        "isa",
        "muhammad",
        "musa",
        "nuh",
        "yahya",
        "yaqub",
        "yusuf",
        "zakariya",
      ])
    );
  });

  it("every story slug is unique", () => {
    const slugs = STORIES.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(STORIES.length);
  });

  it("every chapter id is unique within its story", () => {
    for (const story of STORIES) {
      const ids = story.chapters.map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("every verseRef is a real, structurally valid Quran reference", () => {
    for (const story of STORIES) {
      for (const chapter of story.chapters) {
        expect(chapter.verseRefs.length).toBeGreaterThan(0);
        for (const ref of chapter.verseRefs) {
          expect(isValidRef(ref), `${story.slug}/${chapter.id}: ${ref}`).toBe(true);
        }
      }
    }
  });

  it("every LocalizedText field has a non-empty English string", () => {
    for (const story of STORIES) {
      expect(story.name.en.length).toBeGreaterThan(0);
      expect(story.tagline.en.length).toBeGreaterThan(0);
      expect(story.intro.en.length).toBeGreaterThan(0);
      for (const chapter of story.chapters) {
        expect(chapter.title.en.length).toBeGreaterThan(0);
        expect(chapter.narrative.en.length).toBeGreaterThan(0);
        if (chapter.reflection) expect(chapter.reflection.en.length).toBeGreaterThan(0);
      }
    }
  });

  it("every arabicName and primarySurahs entry is present and well-formed", () => {
    for (const story of STORIES) {
      expect(story.arabicName.length).toBeGreaterThan(0);
      expect(story.primarySurahs.length).toBeGreaterThan(0);
      for (const surah of story.primarySurahs) {
        expect(surah).toBeGreaterThanOrEqual(1);
        expect(surah).toBeLessThanOrEqual(114);
      }
    }
  });

  it("every relatedNames entry resolves to a real divine name slug", () => {
    for (const story of STORIES) {
      for (const slug of story.relatedNames ?? []) {
        expect(getNameBySlug(slug), `${story.slug}: relatedNames "${slug}"`).toBeDefined();
      }
    }
  });
});

describe("getStoryBySlug", () => {
  it("returns the matching story", () => {
    expect(getStoryBySlug("yusuf")?.slug).toBe("yusuf");
  });

  it("returns undefined for an unknown slug", () => {
    expect(getStoryBySlug("not-a-real-prophet")).toBeUndefined();
  });
});

describe("listStories", () => {
  it("returns all stories", () => {
    expect(listStories()).toHaveLength(STORIES.length);
  });
});

describe("resolveLocalized", () => {
  it("returns the English text when no locale-specific field exists", () => {
    expect(resolveLocalized({ en: "hello" }, "tr")).toBe("hello");
  });

  it("returns the locale-specific text when present", () => {
    expect(resolveLocalized({ en: "hello", tr: "merhaba" }, "tr")).toBe("merhaba");
  });

  it("returns the English text for the en locale", () => {
    expect(resolveLocalized({ en: "hello" }, "en")).toBe("hello");
  });
});
