import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockCookies } = vi.hoisted(() => ({ mockCookies: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: mockCookies }));

import { getUiLocale, getQuranEdition } from "@/lib/i18n/request-prefs";

function cookieJar(values: Record<string, string>) {
  return { get: (name: string) => (values[name] ? { value: values[name] } : undefined) };
}

describe("request-prefs", () => {
  beforeEach(() => mockCookies.mockReset());

  describe("getUiLocale", () => {
    it("returns the cookie value when valid", async () => {
      mockCookies.mockResolvedValue(cookieJar({ oh_locale: "tr" }));
      expect(await getUiLocale()).toBe("tr");
    });

    it("falls back to en when the cookie is missing", async () => {
      mockCookies.mockResolvedValue(cookieJar({}));
      expect(await getUiLocale()).toBe("en");
    });

    it("falls back to en when the cookie holds an unrecognized value", async () => {
      mockCookies.mockResolvedValue(cookieJar({ oh_locale: "fr" }));
      expect(await getUiLocale()).toBe("en");
    });
  });

  describe("getQuranEdition", () => {
    it("returns the cookie value when whitelisted", async () => {
      mockCookies.mockResolvedValue(cookieJar({ oh_edition: "tr.diyanet" }));
      expect(await getQuranEdition()).toBe("tr.diyanet");
    });

    it("falls back to the default edition for the resolved locale when the cookie is invalid", async () => {
      mockCookies.mockResolvedValue(cookieJar({ oh_locale: "ru", oh_edition: "not-real" }));
      expect(await getQuranEdition()).toBe("ru.kuliev");
    });

    it("falls back to en.sahih when neither cookie is set", async () => {
      mockCookies.mockResolvedValue(cookieJar({}));
      expect(await getQuranEdition()).toBe("en.sahih");
    });
  });
});
