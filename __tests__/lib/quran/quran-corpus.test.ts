import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock the drizzle db ──────────────────────────────────────────────────────
function makeDbChain(resolveWith: unknown = []) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = new Proxy(
    function () {
      return chain;
    },
    {
      get(_t, prop) {
        if (prop === "then")
          return (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
            Promise.resolve(resolveWith).then(res, rej);
        if (prop === "catch")
          return (rej: (e: unknown) => unknown) => Promise.resolve(resolveWith).catch(rej);
        return () => chain;
      },
      apply() {
        return chain;
      },
    }
  );
  return chain;
}

const { mockSelect } = vi.hoisted(() => ({ mockSelect: vi.fn(() => makeDbChain([])) }));

vi.mock("@/lib/infra/db", () => ({ db: { select: mockSelect } }));

import { getVerse, getVerses, existingRefs, isValidRef } from "@/lib/quran/quran-corpus";

const ARABIC_BY_REF: Record<string, string> = {
  "1:1": "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ",
  "2:255": "اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ",
};

function row(ref: string, surah: number, ayah: number) {
  return {
    ref,
    surah,
    ayah,
    arabicText: ARABIC_BY_REF[ref] ?? ARABIC_BY_REF["1:1"],
    translation: "text",
    transliteration: null,
    createdAt: new Date(),
  };
}

describe("quran-corpus", () => {
  beforeEach(() => mockSelect.mockReset());

  describe("isValidRef", () => {
    it("accepts in-bounds refs", () => {
      expect(isValidRef("2:255")).toBe(true);
      expect(isValidRef("114:1")).toBe(true);
    });
    it("rejects out-of-bounds and malformed refs", () => {
      expect(isValidRef("0:1")).toBe(false);
      expect(isValidRef("115:1")).toBe(false);
      expect(isValidRef("2:0")).toBe(false);
      expect(isValidRef("abc")).toBe(false);
      expect(isValidRef("2:255:3")).toBe(false);
    });
    it("accepts the longest surah's last ayah but rejects past it", () => {
      expect(isValidRef("2:286")).toBe(true); // Al-Baqarah, longest surah
      expect(isValidRef("2:287")).toBe(false);
    });
    it("rejects an absurdly large ayah number regardless of surah", () => {
      expect(isValidRef("114:99999")).toBe(false); // An-Nas has only 6 ayahs
    });
    it("enforces each surah's real ayah count, not just a global ceiling", () => {
      expect(isValidRef("1:7")).toBe(true); // Al-Fatihah's last ayah
      expect(isValidRef("1:8")).toBe(false); // Al-Fatihah has only 7
      expect(isValidRef("114:6")).toBe(true); // An-Nas's last ayah
      expect(isValidRef("114:7")).toBe(false);
      expect(isValidRef("50:45")).toBe(true); // Qaf's last ayah
      expect(isValidRef("50:46")).toBe(false);
    });
  });

  describe("getVerse", () => {
    it("reads from the DB and maps the row to a Verse", async () => {
      mockSelect.mockReturnValue(makeDbChain([row("1:1", 1, 1)]));
      const verse = await getVerse("1:1");
      expect(mockSelect).toHaveBeenCalledTimes(1);
      expect(verse).toMatchObject({ ref: "1:1", surah: 1, ayah: 1, surahName: "Al-Fatiha" });
    });

    it("returns null when the verse is not in the corpus", async () => {
      mockSelect.mockReturnValue(makeDbChain([]));
      expect(await getVerse("2:255")).toBeNull();
    });

    it("never calls fetch", async () => {
      const fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);
      mockSelect.mockReturnValue(makeDbChain([row("1:1", 1, 1)]));
      await getVerse("1:1");
      expect(fetchSpy).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
    });
  });

  describe("getVerses", () => {
    it("returns an empty map for no refs without touching the DB", async () => {
      const map = await getVerses([]);
      expect(map.size).toBe(0);
      expect(mockSelect).not.toHaveBeenCalled();
    });

    it("returns a map keyed by ref", async () => {
      mockSelect.mockReturnValue(makeDbChain([row("1:1", 1, 1), row("2:255", 2, 255)]));
      const map = await getVerses(["1:1", "2:255"]);
      expect(map.get("2:255")).toMatchObject({ ayah: 255 });
      expect(map.size).toBe(2);
    });
  });

  describe("getVerse with edition", () => {
    it("uses the joined translation text when an edition row exists", async () => {
      mockSelect.mockReturnValue(
        makeDbChain([{ verse: row("2:255", 2, 255), translationText: "Türkçe metin" }])
      );
      const verse = await getVerse("2:255", "tr.diyanet");
      expect(verse?.translation).toBe("Türkçe metin");
    });

    it("falls back to the base English translation when no edition row exists", async () => {
      mockSelect.mockReturnValue(
        makeDbChain([{ verse: row("2:255", 2, 255), translationText: null }])
      );
      const verse = await getVerse("2:255", "tr.diyanet");
      expect(verse?.translation).toBe("text"); // row()'s default translation
    });
  });

  describe("getVerses with edition", () => {
    it("returns a map keyed by ref with per-row translation overrides", async () => {
      mockSelect.mockReturnValue(
        makeDbChain([
          { verse: row("1:1", 1, 1), translationText: "Türkçe 1" },
          { verse: row("2:255", 2, 255), translationText: null },
        ])
      );
      const map = await getVerses(["1:1", "2:255"], "tr.diyanet");
      expect(map.get("1:1")?.translation).toBe("Türkçe 1");
      expect(map.get("2:255")?.translation).toBe("text");
    });
  });

  describe("existingRefs", () => {
    it("returns the set of refs present in the corpus", async () => {
      mockSelect.mockReturnValue(makeDbChain([{ ref: "1:1" }, { ref: "2:255" }]));
      const set = await existingRefs(["1:1", "2:255", "999:1"]);
      expect(set.has("1:1")).toBe(true);
      expect(set.has("999:1")).toBe(false);
    });
  });
});
