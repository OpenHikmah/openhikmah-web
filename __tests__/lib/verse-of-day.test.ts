import { describe, it, expect, vi } from "vitest";

// verseOfDayRef is pure, but importing the module pulls in resolveVerse →
// the DB chain. Mock it so the unit test stays isolated to the picker logic.
vi.mock("@/lib/verse-resolver", () => ({ resolveVerse: vi.fn() }));

import { verseOfDayRef } from "@/lib/verse-of-day";

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
