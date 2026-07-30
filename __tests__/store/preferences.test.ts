import { describe, it, expect, beforeEach } from "vitest";
import { usePreferencesStore, LOCALE_COOKIE, EDITION_COOKIE } from "@/store/preferences";
import { DEFAULT_RECITER } from "@/lib/quran/audio";

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
      canvasPrefs: { showMinimap: true },
    });
  });

  it("defaults to English UI locale and the default reciter", () => {
    const s = usePreferencesStore.getState();
    expect(s.uiLocale).toBe("en");
    expect(s.reciter).toBe(DEFAULT_RECITER);
    expect(s.canvasPrefs.showMinimap).toBe(true);
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
    usePreferencesStore.getState().setCanvasPrefs({ showMinimap: false });
    expect(usePreferencesStore.getState().canvasPrefs).toEqual({ showMinimap: false });
  });
});
