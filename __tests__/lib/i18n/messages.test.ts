import { describe, it, expect } from "vitest";
import IntlMessageFormat from "intl-messageformat";
import { LOCALES } from "@/lib/i18n/config";
import en from "@/messages/en.json";
import tr from "@/messages/tr.json";
import ru from "@/messages/ru.json";
import az from "@/messages/az.json";

const MESSAGES: Record<string, Record<string, Record<string, string>>> = { en, tr, ru, az };

function flatten(messages: Record<string, Record<string, string>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [namespace, keys] of Object.entries(messages)) {
    for (const [key, value] of Object.entries(keys)) {
      out[`${namespace}.${key}`] = value;
    }
  }
  return out;
}

describe("i18n messages", () => {
  it("every non-en locale has no keys beyond en (no orphans)", () => {
    const enKeys = new Set(Object.keys(flatten(en)));
    for (const locale of LOCALES) {
      if (locale === "en") continue;
      const localeKeys = Object.keys(flatten(MESSAGES[locale]));
      const orphans = localeKeys.filter((k) => !enKeys.has(k));
      expect(orphans, `${locale} has orphan keys not present in en`).toEqual([]);
    }
  });

  it("every non-en locale has every key present in en (no locale silently missing a key)", () => {
    const enKeys = Object.keys(flatten(en));
    for (const locale of LOCALES) {
      if (locale === "en") continue;
      const localeKeys = new Set(Object.keys(flatten(MESSAGES[locale])));
      for (const key of enKeys) {
        expect(localeKeys.has(key), `${locale} is missing key ${key} present in en`).toBe(true);
      }
    }
  });

  it("every message parses as valid ICU syntax in every locale", () => {
    for (const locale of LOCALES) {
      const flat = flatten(MESSAGES[locale]);
      for (const [key, value] of Object.entries(flat)) {
        expect(() => new IntlMessageFormat(value, locale), `${locale}.${key}`).not.toThrow();
      }
    }
  });
});
