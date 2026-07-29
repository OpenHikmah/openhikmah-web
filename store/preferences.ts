"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_RECITER } from "@/lib/quran/audio";

// Locale/edition cookie names are duplicated (not imported) from
// lib/i18n/config.ts intentionally — that module lands with the
// multi-language epic and will re-export these same names; this store must
// stand alone until then.
export const LOCALE_COOKIE = "oh_locale";
export const EDITION_COOKIE = "oh_edition";

export type UiLocale = "en" | "tr" | "ru" | "az";

export interface CanvasPrefs {
  /** Whether the minimap panel renders on the canvas once nodes exist. */
  showMinimap: boolean;
}

const DEFAULT_CANVAS_PREFS: CanvasPrefs = { showMinimap: true };

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
