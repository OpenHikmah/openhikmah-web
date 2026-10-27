import { describe, it, expect } from "vitest";
import { JOURNEYS } from "@/lib/social/journeys";
import { isValidRef } from "@/lib/quran/quran-corpus";
import en from "@/messages/en.json";
import tr from "@/messages/tr.json";
import ru from "@/messages/ru.json";
import az from "@/messages/az.json";

const LOCALES = { en, tr, ru, az } as const;

describe("JOURNEYS", () => {
  it("every journey starts on a real Quran verse", () => {
    for (const j of JOURNEYS) {
      expect(isValidRef(j.ref), `${j.labelKey}: ${j.ref}`).toBe(true);
    }
  });

  it("has unique label keys and unique starting verses", () => {
    expect(new Set(JOURNEYS.map((j) => j.labelKey)).size).toBe(JOURNEYS.length);
    expect(new Set(JOURNEYS.map((j) => j.ref)).size).toBe(JOURNEYS.length);
  });

  it("every label key resolves to a non-empty translation in every locale", () => {
    for (const [locale, messages] of Object.entries(LOCALES)) {
      const labels = (messages.canvas as { journey: Record<string, string> }).journey;
      for (const j of JOURNEYS) {
        expect(
          labels[j.labelKey]?.length,
          `${locale}: canvas.journey.${j.labelKey}`
        ).toBeGreaterThan(0);
      }
    }
  });
});
