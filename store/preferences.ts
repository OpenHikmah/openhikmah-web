"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_RECITER } from "@/lib/quran/audio";
import { CARD_HEIGHT_WITH_ARABIC, CARD_HEIGHT_WITHOUT_ARABIC } from "@/lib/canvas/canvas-layout";
import { LOCALE_COOKIE, EDITION_COOKIE, type Locale } from "@/lib/i18n/config";

export { LOCALE_COOKIE, EDITION_COOKIE };
export type UiLocale = Locale;

export interface CanvasPrefs {
  /** Whether verse cards on the canvas show the Arabic text. The reading panel always does. */
  showArabic: boolean;
}

const DEFAULT_CANVAS_PREFS: CanvasPrefs = { showArabic: true };

interface PreferencesStore {
  uiLocale: UiLocale;
  quranEditionByLocale: Partial<Record<UiLocale, string>>;
  reciter: string;
  canvasPrefs: CanvasPrefs;

  setUiLocale: (locale: UiLocale) => void;
  setQuranEdition: (locale: UiLocale, edition: string) => void;
  setReciter: (reciter: string) => void;
  setCanvasPrefs: (prefs: Partial<CanvasPrefs>) => void;
}

function setCookie(name: string, value: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=31536000; SameSite=Lax`;
}

function clearCookie(name: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
}

// Keeps oh_edition in sync with the active locale: clears it when that
// locale has no edition set yet, so the server never sees a stale
// edition left over from a previously active locale.
function syncEditionCookie(locale: UiLocale, editions: Partial<Record<UiLocale, string>>) {
  const edition = editions[locale];
  if (edition) setCookie(EDITION_COOKIE, edition);
  else clearCookie(EDITION_COOKIE);
}

export const usePreferencesStore = create<PreferencesStore>()(
  persist(
    (set, get) => ({
      uiLocale: "en",
      quranEditionByLocale: {},
      reciter: DEFAULT_RECITER,
      canvasPrefs: DEFAULT_CANVAS_PREFS,

      setUiLocale: (locale) => {
        set({ uiLocale: locale });
        setCookie(LOCALE_COOKIE, locale);
        syncEditionCookie(locale, get().quranEditionByLocale);
      },

      setQuranEdition: (locale, edition) => {
        set((s) => ({
          quranEditionByLocale: { ...s.quranEditionByLocale, [locale]: edition },
        }));
        if (get().uiLocale === locale) setCookie(EDITION_COOKIE, edition);
      },

      setReciter: (reciter) => set({ reciter }),

      setCanvasPrefs: (prefs) => set((s) => ({ canvasPrefs: { ...s.canvasPrefs, ...prefs } })),
    }),
    {
      name: "open-hikmah-preferences",
      partialize: (s) => ({
        uiLocale: s.uiLocale,
        quranEditionByLocale: s.quranEditionByLocale,
        reciter: s.reciter,
        canvasPrefs: s.canvasPrefs,
      }),
      // Stored canvasPrefs may predate a field — fill any missing one from the defaults.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<PreferencesStore>;
        return {
          ...current,
          ...p,
          canvasPrefs: { ...DEFAULT_CANVAS_PREFS, ...p.canvasPrefs },
        };
      },
      // localStorage is the source of truth; re-sync cookies (read by server
      // components via next/headers) whenever a persisted value rehydrates.
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        setCookie(LOCALE_COOKIE, state.uiLocale);
        syncEditionCookie(state.uiLocale, state.quranEditionByLocale);
      },
    }
  )
);

/** Height the canvas layout assumes for a card React Flow hasn't measured yet. */
export function fallbackCardHeight(): number {
  return usePreferencesStore.getState().canvasPrefs.showArabic
    ? CARD_HEIGHT_WITH_ARABIC
    : CARD_HEIGHT_WITHOUT_ARABIC;
}
