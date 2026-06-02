import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Verse, VerseRef } from "@/types/quran";

const { mockCallAI, mockResolveVerse, mockInsert, mockGetVerses } = vi.hoisted(() => ({
  mockCallAI: vi.fn(),
  mockResolveVerse: vi.fn(),
  mockInsert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
  mockGetVerses: vi.fn(),
}));

vi.mock("@/lib/ai", () => ({ callAI: mockCallAI }));
vi.mock("@/lib/verse-resolver", () => ({ resolveVerse: mockResolveVerse }));
vi.mock("@/lib/db", () => ({ db: { insert: mockInsert } }));
vi.mock("@/lib/quran-corpus", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/quran-corpus")>();
  return { ...actual, getVerses: mockGetVerses };
});

import { generateConnections, generateGroundedConnections } from "@/lib/connection-generator";

function verse(ref: string): Verse {
  const [s, a] = ref.split(":");
  return {
    surah: parseInt(s, 10),
    ayah: parseInt(a, 10),
    ref: ref as VerseRef,
    arabicText: "نص",
    translation: "text",
    surahName: "Surah",
    surahNameArabic: "سورة",
  };
}

describe("generateConnections", () => {
  beforeEach(() => {
    mockCallAI.mockReset();
    mockResolveVerse.mockReset();
    mockInsert.mockClear();
    // Default: every ref resolves.
    mockResolveVerse.mockImplementation(async (ref: string) => verse(ref));
  });

  it("returns hydrated connections from the AI response", async () => {
    mockCallAI.mockResolvedValue(
      JSON.stringify([
        { ref: "2:255", reason: "Throne verse." },
        { ref: "3:18", reason: "Witness of oneness." },
        { ref: "112:1", reason: "Pure tawhid." },
      ])
    );
    const out = await generateConnections("1:1", "ar", "tr", "thematic");
    expect(mockCallAI).toHaveBeenCalledTimes(1);
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({ ref: "2:255", reason: "Throne verse.", kind: "thematic" });
  });

  it("logs exactly one ai_generations row per generation", async () => {
    mockCallAI.mockResolvedValue(JSON.stringify([{ ref: "2:255", reason: "x" }]));
    await generateConnections("1:1", "ar", "tr", "root");
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it("drops references that resolve nowhere (hallucinated)", async () => {
    mockCallAI.mockResolvedValue(
      JSON.stringify([
        { ref: "2:255", reason: "real" },
        { ref: "9:999", reason: "fake" },
      ])
    );
    mockResolveVerse.mockImplementation(async (ref: string) =>
      ref === "9:999" ? null : verse(ref)
    );
    const out = await generateConnections("1:1", "ar", "tr", "thematic");
    expect(out.map((c) => c.ref)).toEqual(["2:255"]);
  });

  it("drops syntactically invalid refs and the source ref itself", async () => {
    mockCallAI.mockResolvedValue(
      JSON.stringify([
        { ref: "1:1", reason: "self" },
        { ref: "999:1", reason: "out of bounds" },
        { ref: "garbage", reason: "malformed" },
        { ref: "2:255", reason: "valid" },
      ])
    );
    const out = await generateConnections("1:1", "ar", "tr", "contrast");
    expect(out.map((c) => c.ref)).toEqual(["2:255"]);
  });

  it("returns [] when the AI returns no parseable JSON", async () => {
    mockCallAI.mockResolvedValue("Sorry, I cannot help with that.");
    const out = await generateConnections("1:1", "ar", "tr", "thematic");
    expect(out).toEqual([]);
  });

  it("caps at 3 connections even if the model returns more", async () => {
    mockCallAI.mockResolvedValue(
      JSON.stringify([
        { ref: "2:1", reason: "a" },
        { ref: "2:2", reason: "b" },
        { ref: "2:3", reason: "c" },
        { ref: "2:4", reason: "d" },
      ])
    );
    const out = await generateConnections("1:1", "ar", "tr", "thematic");
    expect(out).toHaveLength(3);
  });
});

describe("generateGroundedConnections", () => {
  beforeEach(() => {
    mockCallAI.mockReset();
    mockInsert.mockClear();
    mockGetVerses.mockReset();
    // Default: every requested candidate ref resolves to a verse.
    mockGetVerses.mockImplementation(async (refs: string[]) =>
      new Map(refs.map((r) => [r, verse(r)]))
    );
  });

  it("selects and articulates from the provided candidates", async () => {
    mockCallAI.mockResolvedValue(
      JSON.stringify([
        { ref: "2:255", reason: "throne verse" },
        { ref: "3:18", reason: "witness of oneness" },
      ])
    );
    const out = await generateGroundedConnections("1:1", "ar", "tr", "thematic", [
      "2:255",
      "3:18",
      "112:1",
    ]);
    expect(out.map((c) => c.ref)).toEqual(["2:255", "3:18"]);
    expect(out[0]).toMatchObject({ reason: "throne verse", kind: "thematic" });
  });

  it("rejects any ref the model returns that was not in the candidate set", async () => {
    mockCallAI.mockResolvedValue(
      JSON.stringify([
        { ref: "2:255", reason: "in set" },
        { ref: "9:99", reason: "NOT a candidate — must be dropped" },
      ])
    );
    const out = await generateGroundedConnections("1:1", "ar", "tr", "root", [
      "2:255",
      "3:18",
    ]);
    expect(out.map((c) => c.ref)).toEqual(["2:255"]);
  });

  it("never returns the source verse even if the model picks it", async () => {
    mockCallAI.mockResolvedValue(
      JSON.stringify([
        { ref: "1:1", reason: "self" },
        { ref: "2:255", reason: "valid" },
      ])
    );
    const out = await generateGroundedConnections("1:1", "ar", "tr", "contrast", [
      "2:255",
    ]);
    expect(out.map((c) => c.ref)).toEqual(["2:255"]);
  });

  it("returns [] without calling the AI when no candidate verse resolves", async () => {
    mockGetVerses.mockResolvedValue(new Map());
    const out = await generateGroundedConnections("1:1", "ar", "tr", "thematic", [
      "2:255",
    ]);
    expect(out).toEqual([]);
    expect(mockCallAI).not.toHaveBeenCalled();
  });

  it("logs exactly one ai_generations row per grounded generation", async () => {
    mockCallAI.mockResolvedValue(JSON.stringify([{ ref: "2:255", reason: "x" }]));
    await generateGroundedConnections("1:1", "ar", "tr", "root", ["2:255"]);
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });
});
