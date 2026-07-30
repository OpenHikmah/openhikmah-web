import type { Locale } from "@/lib/i18n/config";

/** en required; other locales optional, added incrementally. */
export type LocalizedText = { en: string } & Partial<Record<Exclude<Locale, "en">, string>>;

export interface StoryChapter {
  id: string;
  title: LocalizedText;
  narrative: LocalizedText;
  verseRefs: string[];
  reflection?: LocalizedText;
}

export interface Story {
  slug: string;
  name: LocalizedText;
  arabicName: string;
  tagline: LocalizedText;
  intro: LocalizedText;
  primarySurahs: number[];
  chapters: StoryChapter[];
  themes: string[];
  relatedNames?: string[];
}
