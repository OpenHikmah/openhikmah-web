import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Verse, VerseRef } from "@/types/quran";

const { mockGetVerse, mockGetSurahName } = vi.hoisted(() => ({
  mockGetVerse: vi.fn(),
  mockGetSurahName: vi.fn(),
}));

vi.mock("@/lib/quran/quran-corpus", () => ({ getVerse: mockGetVerse }));
vi.mock("@/lib/quran/surah-names", () => ({ getSurahName: mockGetSurahName }));

import { resolveVerse } from "@/lib/quran/verse-resolver";

function verse(ref: string): Verse {
  const [s, a] = ref.split(":");
  return {
    surah: parseInt(s, 10),
    ayah: parseInt(a, 10),
    ref: ref as VerseRef,
    arabicText: "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ",
    translation: "text",
    surahName: "Surah",
    surahNameArabic: "سورة",
  };
}

describe("resolveVerse", () => {
  beforeEach(() => {
    mockGetVerse.mockReset();
    mockGetSurahName.mockReset();
    mockGetSurahName.mockReturnValue(["Al-Fatihah", "الفاتحة"]);
    vi.stubGlobal("fetch", vi.fn());
  });

  it("returns the local corpus verse without hitting the live API", async () => {
    const v = verse("1:1");
    mockGetVerse.mockResolvedValue(v);
    const result = await resolveVerse("1:1");
    expect(result).toBe(v);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("falls back to the live API when the corpus has no entry", async () => {
    mockGetVerse.mockResolvedValue(null);
    vi.mocked(fetch).mockImplementation(async (url: string | URL | Request) => {
      const isArabic = String(url).includes("ar.alafasy");
      return {
        ok: true,
        json: async () => ({
          data: { text: isArabic ? "اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ" : "English text" },
        }),
      } as Response;
    });
    const result = await resolveVerse("2:255");
    expect(result).toMatchObject({
      surah: 2,
      ayah: 255,
      ref: "2:255",
      arabicText: "اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ",
      translation: "English text",
    });
  });

  it("falls back to the live API when the corpus lookup throws", async () => {
    mockGetVerse.mockRejectedValue(new Error("db down"));
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ data: { text: "x" } }),
    } as Response);
    const result = await resolveVerse("1:1");
    expect(result).not.toBeNull();
  });

  it("returns null for a malformed ref without calling the live API", async () => {
    mockGetVerse.mockResolvedValue(null);
    const result = await resolveVerse("not-a-ref");
    expect(result).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns null for a surah number out of bounds", async () => {
    mockGetVerse.mockResolvedValue(null);
    const result = await resolveVerse("115:1");
    expect(result).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns null when either live fetch response is not ok", async () => {
    mockGetVerse.mockResolvedValue(null);
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    const result = await resolveVerse("2:255");
    expect(result).toBeNull();
  });

  it("returns null and does not throw when the live fetch rejects", async () => {
    mockGetVerse.mockResolvedValue(null);
    vi.mocked(fetch).mockRejectedValue(new Error("network error"));
    const result = await resolveVerse("2:255");
    expect(result).toBeNull();
  });

  it("passes an unrecognized edition through as undefined (falls back to en.sahih)", async () => {
    const v = verse("1:1");
    mockGetVerse.mockResolvedValue(v);
    await resolveVerse("1:1", "not-a-real-edition");
    expect(mockGetVerse).toHaveBeenCalledWith("1:1", undefined);
  });

  it("passes a whitelisted non-default edition through to getVerse", async () => {
    const v = verse("1:1");
    mockGetVerse.mockResolvedValue(v);
    await resolveVerse("1:1", "tr.diyanet");
    expect(mockGetVerse).toHaveBeenCalledWith("1:1", "tr.diyanet");
  });

  it("live fallback fetches the requested edition's endpoint", async () => {
    mockGetVerse.mockResolvedValue(null);
    vi.mocked(fetch).mockImplementation(async (url: string | URL | Request) => {
      const isArabic = String(url).includes("ar.alafasy");
      return {
        ok: true,
        json: async () => ({
          data: { text: isArabic ? "اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ" : "Türkçe metin" },
        }),
      } as Response;
    });
    const result = await resolveVerse("2:255", "tr.diyanet");
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/tr.diyanet"), expect.anything());
    expect(result?.translation).toBe("Türkçe metin");
  });

  it("both parallel live fallback fetches pass an abort signal so a hung upstream fails fast", async () => {
    mockGetVerse.mockResolvedValue(null);
    vi.mocked(fetch).mockImplementation(async (url: string | URL | Request) => {
      const isArabic = String(url).includes("ar.alafasy");
      return {
        ok: true,
        json: async () => ({
          data: { text: isArabic ? "اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ" : "English text" },
        }),
      } as Response;
    });
    await resolveVerse("2:255");
    expect(fetch).toHaveBeenCalledTimes(2);
    for (const call of vi.mocked(fetch).mock.calls) {
      expect(call[1]).toEqual(expect.objectContaining({ signal: expect.any(AbortSignal) }));
    }
  });

  it("the en.sahih fallback fetch (when the requested edition 404s) also passes an abort signal", async () => {
    mockGetVerse.mockResolvedValue(null);
    vi.mocked(fetch).mockImplementation(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes("ar.alafasy")) {
        return {
          ok: true,
          json: async () => ({ data: { text: "اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ" } }),
        } as Response;
      }
      if (u.includes("tr.diyanet")) {
        return { ok: false } as Response;
      }
      return { ok: true, json: async () => ({ data: { text: "English fallback" } }) } as Response;
    });
    await resolveVerse("2:255", "tr.diyanet");
    const fallbackCall = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => String(url).includes(`/en.sahih`));
    expect(fallbackCall).toBeDefined();
    expect(fallbackCall?.[1]).toEqual(expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it("live fallback falls back to en.sahih when the requested edition 404s upstream", async () => {
    mockGetVerse.mockResolvedValue(null);
    vi.mocked(fetch).mockImplementation(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes("ar.alafasy")) {
        return {
          ok: true,
          json: async () => ({ data: { text: "اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ" } }),
        } as Response;
      }
      if (u.includes("tr.diyanet")) {
        return { ok: false } as Response;
      }
      return { ok: true, json: async () => ({ data: { text: "English fallback" } }) } as Response;
    });
    const result = await resolveVerse("2:255", "tr.diyanet");
    expect(result?.translation).toBe("English fallback");
  });

  it("live fallback applies the verified correction for 103:2/az.mammadaliyev", async () => {
    mockGetVerse.mockResolvedValue(null);
    vi.mocked(fetch).mockImplementation(async (url: string | URL | Request) => {
      const isArabic = String(url).includes("ar.alafasy");
      return {
        ok: true,
        json: async () => ({
          data: {
            text: isArabic
              ? "نص عربي"
              : "İnsan (ömrünü bihudə işlərə sərf etməklə, dünyanı axirətdən üstün tutmaqla) ziyan içindədir?",
          },
        }),
      } as Response;
    });
    const result = await resolveVerse("103:2", "az.mammadaliyev");
    expect(result?.translation).toBe(
      "İnsan (ömrünü bihudə işlərə sərf etməklə, dünyanı axirətdən üstün tutmaqla) ziyan içindədir."
    );
  });

  it("does not apply the az.mammadaliyev correction when that edition 404s and falls back to en.sahih", async () => {
    mockGetVerse.mockResolvedValue(null);
    vi.mocked(fetch).mockImplementation(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes("ar.alafasy")) {
        return { ok: true, json: async () => ({ data: { text: "نص عربي" } }) } as Response;
      }
      if (u.includes("az.mammadaliyev")) {
        return { ok: false } as Response;
      }
      return {
        ok: true,
        json: async () => ({ data: { text: "Indeed, mankind is in loss," } }),
      } as Response;
    });
    const result = await resolveVerse("103:2", "az.mammadaliyev");
    // The correction table only has an entry for (103:2, az.mammadaliyev) —
    // since the resolved edition is en.sahih here, it must not fire.
    expect(result?.translation).toBe("Indeed, mankind is in loss,");
  });
});
