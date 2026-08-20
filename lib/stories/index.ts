import type { Locale } from "@/lib/i18n/config";
import type { LocalizedText, Story } from "./types";
import { ADAM_STORY } from "./data/adam";
import { NUH_STORY } from "./data/nuh";
import { IBRAHIM_STORY } from "./data/ibrahim";
import { MUSA_STORY } from "./data/musa";
import { DAWUD_STORY } from "./data/dawud";
import { SULAIMAN_STORY } from "./data/sulaiman";
import { YUNUS_STORY } from "./data/yunus";
import { YUSUF_STORY } from "./data/yusuf";
import { ISA_STORY } from "./data/isa";
import { MUHAMMAD_STORY } from "./data/muhammad";

export type { Story, StoryChapter, LocalizedText } from "./types";

export const STORIES: Story[] = [
  ADAM_STORY,
  NUH_STORY,
  IBRAHIM_STORY,
  MUSA_STORY,
  DAWUD_STORY,
  SULAIMAN_STORY,
  YUNUS_STORY,
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

/** Falls back to English when a locale-specific field hasn't been authored yet. */
export function resolveLocalized(text: LocalizedText, locale: Locale): string {
  return text[locale] ?? text.en;
}
