import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { createTranslator } from "use-intl/core";
import en from "@/messages/en.json";
import type { Verse } from "@/types/quran";

const MESSAGES = { en };

const { mockGetQuranEdition, mockGetSurahVerses } = vi.hoisted(() => ({
  mockGetQuranEdition: vi.fn().mockResolvedValue("en.sahih"),
  mockGetSurahVerses: vi.fn(),
}));

vi.mock("@/lib/i18n/request-prefs", () => ({ getQuranEdition: mockGetQuranEdition }));
vi.mock("@/lib/quran/quran-corpus", () => ({ getSurahVerses: mockGetSurahVerses }));
// next-intl/server's getTranslations relies on the RSC build, which isn't
// resolved under vitest's jsdom environment — build a real translator (ICU
// formatting included) so t("ayahCount", {count}) etc. resolve for real.
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) =>
    createTranslator({ locale: "en", messages: MESSAGES.en, namespace: namespace as never }),
}));

function verse(ref: string): Verse {
  const [s, a] = ref.split(":");
  return {
    surah: Number(s),
    ayah: Number(a),
    ref: ref as Verse["ref"],
    arabicText: "الفاتحة",
    translation: "translation text",
    surahName: "Al-Fatiha",
    surahNameArabic: "الفاتحة",
  };
}

function extractText(node: unknown): string[] {
  if (typeof node === "string") return [node];
  if (typeof node === "number") return [String(node)];
  if (Array.isArray(node)) return node.flatMap(extractText);
  if (node && typeof node === "object" && "props" in node) {
    return extractText((node as { props?: { children?: ReactNode } }).props?.children);
  }
  return [];
}

describe("Surah reading page", () => {
  beforeEach(() => {
    mockGetSurahVerses.mockReset();
    mockGetSurahVerses.mockResolvedValue([verse("1:1"), verse("1:2")]);
  });

  it("renders the surah name and ayah count", async () => {
    const { default: SurahReaderPage } = await import("@/app/surah/[number]/page");
    const text = extractText(await SurahReaderPage({ params: Promise.resolve({ number: "1" }) }));
    expect(text).toContain("Al-Fatiha");
    expect(text.join(" ")).toMatch(/7 ayahs/);
  });

  it("fetches every ayah for the requested surah with the caller's edition", async () => {
    mockGetQuranEdition.mockResolvedValueOnce("tr.diyanet");
    const { default: SurahReaderPage } = await import("@/app/surah/[number]/page");
    await SurahReaderPage({ params: Promise.resolve({ number: "18" }) });
    expect(mockGetSurahVerses).toHaveBeenCalledWith(18, "tr.diyanet");
  });

  it("404s for a surah number out of range", async () => {
    const { default: SurahReaderPage } = await import("@/app/surah/[number]/page");
    await expect(SurahReaderPage({ params: Promise.resolve({ number: "115" }) })).rejects.toThrow();
  });

  it("404s for a non-numeric surah segment", async () => {
    const { default: SurahReaderPage } = await import("@/app/surah/[number]/page");
    await expect(SurahReaderPage({ params: Promise.resolve({ number: "abc" }) })).rejects.toThrow();
  });
});
