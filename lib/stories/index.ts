import type { Locale } from "@/lib/i18n/config";
import type { LocalizedText, Story } from "./types";
import { getHiddenSlugs } from "./story-flags";
import { ADAM_STORY } from "./data/adam";
import { NUH_STORY } from "./data/nuh";
import { IBRAHIM_STORY } from "./data/ibrahim";
import { MUSA_STORY } from "./data/musa";
import { YUSUF_STORY } from "./data/yusuf";
import { ISA_STORY } from "./data/isa";
import { MUHAMMAD_STORY } from "./data/muhammad";

export type { Story, StoryChapter, LocalizedText } from "./types";

export const STORIES: Story[] = [
  ADAM_STORY,
  NUH_STORY,
  IBRAHIM_STORY,
  MUSA_STORY,
  YUSUF_STORY,
  ISA_STORY,
  MUHAMMAD_STORY,
];

export function getStoryBySlug(slug: string): Story | undefined {
  return STORIES.find((s) => s.slug === slug);
}

export function listStories(): Story[] {
  return STORIES;
}

/** `STORIES` minus anything an admin has flagged hidden — what production shows. */
export async function listVisibleStories(): Promise<Story[]> {
  const hidden = await getHiddenSlugs();
  return STORIES.filter((s) => !hidden.has(s.slug));
}

/** `getStoryBySlug`, but `undefined` for a hidden slug too — for public-facing pages. */
export async function getVisibleStoryBySlug(slug: string): Promise<Story | undefined> {
  const story = getStoryBySlug(slug);
  if (!story) return undefined;
  const hidden = await getHiddenSlugs();
  return hidden.has(slug) ? undefined : story;
}

/** Falls back to English when a locale-specific field hasn't been authored yet. */
export function resolveLocalized(text: LocalizedText, locale: Locale): string {
  return text[locale] ?? text.en;
}
