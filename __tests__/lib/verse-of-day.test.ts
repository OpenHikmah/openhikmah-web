import { describe, it, expect, vi, beforeEach } from "vitest";

// verseOfDayRef is pure, but importing the module pulls in resolveVerse →
// the DB chain. Mock it so the unit test stays isolated to the picker logic.
vi.mock("@/lib/verse-resolver", () => ({ resolveVerse: vi.fn() }));

import { resolveVerse } from "@/lib/verse-resolver";
import { verseOfDayRef, getVerseOfDay, getCuratedVerseOfDay } from "@/lib/verse-of-day";

describe("verseOfDayRef", () => {
  it("returns a valid verse ref (surah:ayah)", () => {
    expect(verseOfDayRef(new Date("2026-06-03T00:00:00Z"))).toMatch(/^\d+:\d+$/);
  });

  it("is deterministic for the same UTC day", () => {
    const a = verseOfDayRef(new Date("2026-06-03T01:00:00Z"));
    const b = verseOfDayRef(new Date("2026-06-03T23:59:00Z"));
    expect(a).toBe(b);
  });

  it("can change from one day to the next", () => {
    // Collect a month of picks — a deterministic hash over a 16-verse pool
    // must yield more than one distinct verse across 30 days.
    const refs = new Set<string>();
    for (let d = 1; d <= 30; d++) {
      const date = new Date(Date.UTC(2026, 5, d));
      refs.add(verseOfDayRef(date));
    }
    expect(refs.size).toBeGreaterThan(1);
  });

  it("defaults to the current date without throwing", () => {
    expect(verseOfDayRef()).toMatch(/^\d+:\d+$/);
  });
});

describe("getVerseOfDay override seam", () => {
  beforeEach(() => vi.mocked(resolveVerse).mockReset());

  it("getCuratedVerseOfDay returns null until the admin calendar is built", async () => {
    expect(await getCuratedVerseOfDay(new Date("2026-06-04T00:00:00Z"))).toBeNull();
  });

  it("falls back to the algorithmic pick when no curated entry exists", async () => {
    const verse = { ref: "2:255" } as never;
    vi.mocked(resolveVerse).mockResolvedValue(verse);
    const date = new Date("2026-06-04T00:00:00Z");
    const result = await getVerseOfDay(date);
    expect(vi.mocked(resolveVerse)).toHaveBeenCalledWith(verseOfDayRef(date));
    expect(result).toBe(verse);
  });
});
