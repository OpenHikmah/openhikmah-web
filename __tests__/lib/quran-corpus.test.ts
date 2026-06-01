import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock the drizzle db ──────────────────────────────────────────────────────
function makeDbChain(resolveWith: unknown = []) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = new Proxy(function () { return chain; }, {
    get(_t, prop) {
      if (prop === "then")
        return (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
          Promise.resolve(resolveWith).then(res, rej);
      if (prop === "catch")
        return (rej: (e: unknown) => unknown) => Promise.resolve(resolveWith).catch(rej);
      return () => chain;
    },
    apply() { return chain; },
  });
  return chain;
}

const { mockSelect } = vi.hoisted(() => ({ mockSelect: vi.fn(() => makeDbChain([])) }));

vi.mock("@/lib/db", () => ({ db: { select: mockSelect } }));

import { getVerse, getVerses, existingRefs, isValidRef } from "@/lib/quran-corpus";

function row(ref: string, surah: number, ayah: number) {
  return {
    ref,
    surah,
    ayah,
    arabicText: "نص",
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

  describe("existingRefs", () => {
    it("returns the set of refs present in the corpus", async () => {
      mockSelect.mockReturnValue(makeDbChain([{ ref: "1:1" }, { ref: "2:255" }]));
      const set = await existingRefs(["1:1", "2:255", "999:1"]);
      expect(set.has("1:1")).toBe(true);
      expect(set.has("999:1")).toBe(false);
    });
  });
});
