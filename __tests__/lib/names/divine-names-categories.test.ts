import { describe, it, expect } from "vitest";
import { CATEGORY_LABEL_KEYS, CATEGORY_LABELS } from "@/lib/names/divine-names/categories";
import en from "@/messages/en.json";
import tr from "@/messages/tr.json";
import ru from "@/messages/ru.json";
import az from "@/messages/az.json";

const LOCALES = { en, tr, ru, az } as const;
const CATEGORIES = ["dhat", "sifat", "af'al"] as const;

describe("divine name categories", () => {
  it("defines labels for exactly the three categories", () => {
    expect(Object.keys(CATEGORY_LABELS).sort()).toEqual([...CATEGORIES].sort());
    expect(Object.keys(CATEGORY_LABEL_KEYS).sort()).toEqual([...CATEGORIES].sort());
  });

  it("gives every category an Arabic label and an English label and description", () => {
    for (const c of CATEGORIES) {
      expect(CATEGORY_LABELS[c].en.length).toBeGreaterThan(0);
      expect(CATEGORY_LABELS[c].description.length).toBeGreaterThan(0);
      expect(CATEGORY_LABELS[c].ar).toMatch(/[؀-ۿ]/);
    }
  });

  it("every translation key resolves in the names namespace of every locale", () => {
    for (const [locale, messages] of Object.entries(LOCALES)) {
      const names = messages.names as Record<string, string>;
      for (const c of CATEGORIES) {
        const { label, description } = CATEGORY_LABEL_KEYS[c];
        expect(names[label]?.length, `${locale}: names.${label}`).toBeGreaterThan(0);
        expect(names[description]?.length, `${locale}: names.${description}`).toBeGreaterThan(0);
      }
    }
  });
});
