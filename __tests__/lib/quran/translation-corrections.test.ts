import { describe, it, expect } from "vitest";
import { correctTranslation } from "@/lib/quran/translation-corrections";

describe("correctTranslation", () => {
  it("returns the verified correction for an exact (ref, edition) match", () => {
    const result = correctTranslation(
      "103:2",
      "az.mammadaliyev",
      "İnsan (ömrünü bihudə işlərə sərf etməklə, dünyanı axirətdən üstün tutmaqla) ziyan içindədir?"
    );
    expect(result).toBe(
      "İnsan (ömrünü bihudə işlərə sərf etməklə, dünyanı axirətdən üstün tutmaqla) ziyan içindədir."
    );
  });

  it("passes text through unchanged for a different edition of the same ref", () => {
    const text = "some tr.diyanet text";
    expect(correctTranslation("103:2", "tr.diyanet", text)).toBe(text);
  });

  it("passes text through unchanged for a different ref of the same edition", () => {
    const text = "some other ayah's text";
    expect(correctTranslation("1:1", "az.mammadaliyev", text)).toBe(text);
  });

  it("passes text through unchanged when no edition is given", () => {
    const text = "en.sahih text";
    expect(correctTranslation("103:2", undefined, text)).toBe(text);
  });
});
