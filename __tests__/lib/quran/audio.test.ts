import { describe, it, expect } from "vitest";
import { getAudioUrl, isValidReciter, DEFAULT_RECITER } from "@/lib/quran/audio";

describe("getAudioUrl", () => {
  it("defaults to the Al-Afasy reciter", () => {
    expect(getAudioUrl(1, 1)).toBe(
      `https://cdn.islamic.network/quran/audio/128/${DEFAULT_RECITER}/1.mp3`
    );
  });

  it("uses the given reciter when whitelisted", () => {
    expect(getAudioUrl(1, 1, "ar.husary")).toBe(
      "https://cdn.islamic.network/quran/audio/128/ar.husary/1.mp3"
    );
  });

  it("falls back to the default reciter for an unknown/unsafe value", () => {
    expect(getAudioUrl(1, 1, "../../etc/passwd")).toBe(
      `https://cdn.islamic.network/quran/audio/128/${DEFAULT_RECITER}/1.mp3`
    );
  });
});

describe("isValidReciter", () => {
  it("accepts known reciters", () => {
    expect(isValidReciter("ar.alafasy")).toBe(true);
  });

  it("rejects unknown values", () => {
    expect(isValidReciter("nonexistent")).toBe(false);
  });
});
