import type { Locale } from "@/lib/i18n/config";
import type { LocalizedText, Story } from "./types";
import { ADAM_STORY } from "./data/adam";
import { NUH_STORY } from "./data/nuh";
import { IBRAHIM_STORY } from "./data/ibrahim";
import { MUSA_STORY } from "./data/musa";
import { AYYUB_STORY } from "./data/ayyub";
import { YUSUF_STORY } from "./data/yusuf";
import { YAQUB_STORY } from "./data/yaqub";
import { ZAKARIYA_STORY } from "./data/zakariya";
import { YAHYA_STORY } from "./data/yahya";
import { ISA_STORY } from "./data/isa";
import { MUHAMMAD_STORY } from "./data/muhammad";

export type { Story, StoryChapter, LocalizedText } from "./types";

export const STORIES: Story[] = [
  ADAM_STORY,
  NUH_STORY,
  IBRAHIM_STORY,
  MUSA_STORY,
  AYYUB_STORY,
  YUSUF_STORY,
  YAQUB_STORY,
  ZAKARIYA_STORY,
  YAHYA_STORY,
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
