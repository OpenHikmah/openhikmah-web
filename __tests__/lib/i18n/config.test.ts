import { describe, it, expect } from "vitest";
import {
  isValidLocale,
  isValidEdition,
  DEFAULT_EDITION_BY_LOCALE,
  LOCALES,
} from "@/lib/i18n/config";

describe("i18n config", () => {
  describe("isValidLocale", () => {
    it("accepts every declared locale", () => {
      for (const locale of LOCALES) expect(isValidLocale(locale)).toBe(true);
    });

    it("rejects unknown values", () => {
      expect(isValidLocale("fr")).toBe(false);
      expect(isValidLocale("")).toBe(false);
    });
  });

  describe("isValidEdition", () => {
    it("accepts every default edition", () => {
      for (const edition of Object.values(DEFAULT_EDITION_BY_LOCALE)) {
        expect(isValidEdition(edition)).toBe(true);
      }
    });

    it("rejects an unrecognized or attacker-controlled value", () => {
      expect(isValidEdition("en.sahih; DROP TABLE verses;")).toBe(false);
      expect(isValidEdition("../../etc/passwd")).toBe(false);
    });
  });
});
