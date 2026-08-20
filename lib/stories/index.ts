import type { Locale } from "@/lib/i18n/config";
import type { LocalizedText, Story } from "./types";
import { ADAM_STORY } from "./data/adam";
import { IDRIS_STORY } from "./data/idris";
import { NUH_STORY } from "./data/nuh";
import { HUD_STORY } from "./data/hud";
import { SALIH_STORY } from "./data/salih";
import { IBRAHIM_STORY } from "./data/ibrahim";
import { ISMAIL_STORY } from "./data/ismail";
import { ISHAQ_STORY } from "./data/ishaq";
import { LUT_STORY } from "./data/lut";
import { SHUAYB_STORY } from "./data/shuayb";
import { MUSA_STORY } from "./data/musa";
import { DAWUD_STORY } from "./data/dawud";
import { SULAIMAN_STORY } from "./data/sulaiman";
import { YUNUS_STORY } from "./data/yunus";
import { AYYUB_STORY } from "./data/ayyub";
import { YUSUF_STORY } from "./data/yusuf";
import { ILYAS_STORY } from "./data/ilyas";
import { ALYASA_STORY } from "./data/alyasa";
import { DHUL_KIFL_STORY } from "./data/dhul-kifl";
import { YAQUB_STORY } from "./data/yaqub";
import { ZAKARIYA_STORY } from "./data/zakariya";
import { YAHYA_STORY } from "./data/yahya";
import { ISA_STORY } from "./data/isa";
import { MUHAMMAD_STORY } from "./data/muhammad";

export type { Story, StoryChapter, LocalizedText } from "./types";

export const STORIES: Story[] = [
  ADAM_STORY,
  IDRIS_STORY,
  NUH_STORY,
  HUD_STORY,
  SALIH_STORY,
  IBRAHIM_STORY,
  ISMAIL_STORY,
  ISHAQ_STORY,
  LUT_STORY,
  SHUAYB_STORY,
  MUSA_STORY,
  DAWUD_STORY,
  SULAIMAN_STORY,
  YUNUS_STORY,
  AYYUB_STORY,
  YUSUF_STORY,
  ILYAS_STORY,
  ALYASA_STORY,
  DHUL_KIFL_STORY,
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
