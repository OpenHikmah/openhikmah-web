// Framework-free locale config, shared by server helpers (lib/i18n/request-prefs.ts)
// and the client preferences store (store/preferences.ts). No next-intl or Next.js
// imports here — this module must be safe to import from anywhere.

export const LOCALES = ["en", "tr", "ru", "az"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

// Each locale's own name for itself (never translated — a language's own
// name is shown the same way regardless of the active UI locale). Single
// source for the LanguagePopover and /settings language pickers, which
// previously each hand-maintained their own copy of this list.
export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  tr: "Türkçe",
  ru: "Русский",
  az: "Azərbaycan dili",
};

export const DEFAULT_EDITION_BY_LOCALE: Record<Locale, string> = {
  en: "en.sahih",
  tr: "tr.diyanet",
  ru: "ru.kuliev",
  az: "az.mammadaliyev",
};

// Alternate editions available per locale (default is always index 0 of the
// combined list — DEFAULT_EDITION_BY_LOCALE — plus these). Kept as a flat
// whitelist so any cookie/query value can be validated in one place.
export const VALID_EDITIONS: readonly string[] = [
  "en.sahih",
  "tr.diyanet",
  "ru.kuliev",
  "az.mammadaliyev",
];

export const LOCALE_COOKIE = "oh_locale";
export const EDITION_COOKIE = "oh_edition";

export function isValidLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

export function isValidEdition(value: string): boolean {
  return VALID_EDITIONS.includes(value);
}
