import { describe, it, expect, beforeEach } from "vitest";
import {
  usePreferencesStore,
  fallbackCardHeight,
  LOCALE_COOKIE,
  EDITION_COOKIE,
} from "@/store/preferences";
import { DEFAULT_RECITER } from "@/lib/quran/audio";
import { CARD_HEIGHT_WITH_ARABIC, CARD_HEIGHT_WITHOUT_ARABIC } from "@/lib/canvas/canvas-layout";

function getCookie(name: string): string | undefined {
  return document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`))
    ?.split("=")[1];
}

describe("preferences store", () => {
  beforeEach(() => {
    localStorage.clear();
    document.cookie.split(";").forEach((c) => {
      document.cookie = c
        .replace(/^ +/, "")
        .replace(/=.*/, "=;expires=" + new Date(0).toUTCString());
    });
    usePreferencesStore.setState({
      uiLocale: "en",
      quranEditionByLocale: {},
      reciter: DEFAULT_RECITER,
      canvasPrefs: { showArabic: true },
    });
  });

  it("defaults to English UI locale and the default reciter", () => {
    const s = usePreferencesStore.getState();
    expect(s.uiLocale).toBe("en");
    expect(s.reciter).toBe(DEFAULT_RECITER);
    expect(s.canvasPrefs.showArabic).toBe(true);
  });

  it("setUiLocale updates state and mirrors to a cookie", () => {
    usePreferencesStore.getState().setUiLocale("tr");
    expect(usePreferencesStore.getState().uiLocale).toBe("tr");
    expect(getCookie(LOCALE_COOKIE)).toBe("tr");
  });

  it("setQuranEdition stores per-locale and mirrors the cookie for the active locale", () => {
    usePreferencesStore.getState().setQuranEdition("en", "en.sahih");
    expect(usePreferencesStore.getState().quranEditionByLocale.en).toBe("en.sahih");
    expect(getCookie(EDITION_COOKIE)).toBe("en.sahih");
  });

  it("setQuranEdition for a non-active locale does not touch the edition cookie", () => {
    usePreferencesStore.getState().setQuranEdition("tr", "tr.diyanet");
    expect(usePreferencesStore.getState().quranEditionByLocale.tr).toBe("tr.diyanet");
    expect(getCookie(EDITION_COOKIE)).toBeUndefined();
  });

  it("setUiLocale clears the edition cookie when switching to a locale with no edition set", () => {
    usePreferencesStore.getState().setQuranEdition("en", "en.sahih");
    expect(getCookie(EDITION_COOKIE)).toBe("en.sahih");

    usePreferencesStore.getState().setUiLocale("tr");
    expect(getCookie(EDITION_COOKIE)).toBeUndefined();
  });

  it("setReciter updates the reciter", () => {
    usePreferencesStore.getState().setReciter("ar.husary");
    expect(usePreferencesStore.getState().reciter).toBe("ar.husary");
  });

  it("setCanvasPrefs merges partial updates", () => {
    usePreferencesStore.getState().setCanvasPrefs({ showArabic: false });
    expect(usePreferencesStore.getState().canvasPrefs).toEqual({ showArabic: false });
  });

  it("gives older saved preferences the Arabic-on-cards default", async () => {
    localStorage.setItem(
      "open-hikmah-preferences",
      JSON.stringify({ state: { uiLocale: "en", canvasPrefs: { showMinimap: false } }, version: 0 })
    );
    await usePreferencesStore.persist.rehydrate();
    expect(usePreferencesStore.getState().canvasPrefs.showArabic).toBe(true);
  });

  it("keeps a saved Arabic-on-cards choice across reloads", async () => {
    localStorage.setItem(
      "open-hikmah-preferences",
      JSON.stringify({ state: { uiLocale: "en", canvasPrefs: { showArabic: false } }, version: 0 })
    );
    await usePreferencesStore.persist.rehydrate();
    expect(usePreferencesStore.getState().canvasPrefs.showArabic).toBe(false);
  });

  it("assumes the taller card height only while Arabic is shown on cards", () => {
    expect(CARD_HEIGHT_WITH_ARABIC).toBeGreaterThan(CARD_HEIGHT_WITHOUT_ARABIC);

    usePreferencesStore.getState().setCanvasPrefs({ showArabic: true });
    expect(fallbackCardHeight()).toBe(CARD_HEIGHT_WITH_ARABIC);

    usePreferencesStore.getState().setCanvasPrefs({ showArabic: false });
    expect(fallbackCardHeight()).toBe(CARD_HEIGHT_WITHOUT_ARABIC);
  });
});
