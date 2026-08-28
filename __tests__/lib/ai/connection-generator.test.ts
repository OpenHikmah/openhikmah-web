import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Verse, VerseRef } from "@/types/quran";

const { mockCallAI, mockCallAIDetailed, mockInsert, mockGetVerses, insertedRows } = vi.hoisted(
  () => {
    const insertedRows: Array<Record<string, unknown>> = [];
    return {
      mockCallAI: vi.fn(),
      mockCallAIDetailed: vi.fn(),
      mockGetVerses: vi.fn(),
      insertedRows,
      mockInsert: vi.fn(() => ({
        values: vi.fn((row: Record<string, unknown>) => {
          insertedRows.push(row);
          return Promise.resolve(undefined);
        }),
      })),
    };
  }
);

// The generator calls callAIDetailed and reads .text/.usage/.model. By default it
// delegates to mockCallAI (text-only) for the response body and reports a Claude
// result, so every existing test drives it the same way; provider-specific tests
// override mockCallAIDetailed directly.
vi.mock("@/lib/ai/ai", () => ({ callAIDetailed: mockCallAIDetailed }));
vi.mock("@/lib/infra/db", () => ({ db: { insert: mockInsert } }));
vi.mock("@/lib/quran/quran-corpus", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/quran/quran-corpus")>();
  return { ...actual, getVerses: mockGetVerses };
});
// No active DB prompt version in these tests — always fall back to the
// hardcoded template, exercising the same rendering path a real generation uses.
vi.mock("@/lib/ai/prompt-registry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/prompt-registry")>();
  return {
    ...actual,
    getPrompt: vi.fn(async (_key: string, fallback: string) => ({
      template: fallback,
      version: null,
    })),
  };
});

import { generateConnections, generateGroundedConnections } from "@/lib/ai/connection-generator";
import { getPrompt } from "@/lib/ai/prompt-registry";

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

const defaultDetailed = async (prompt: string) => ({
  text: await mockCallAI(prompt),
  usage: { inputTokens: 100, outputTokens: 20 },
  provider: "claude" as const,
  model: "claude-opus-4-7",
});

describe("generateConnections", () => {
  beforeEach(() => {
    mockCallAI.mockReset();
    mockCallAIDetailed.mockReset().mockImplementation(defaultDetailed);
    insertedRows.length = 0;
    mockInsert.mockClear();
    mockGetVerses.mockReset();
    // Default: every requested ref hydrates from the local corpus.
    mockGetVerses.mockImplementation(
      async (refs: string[]) => new Map(refs.map((r) => [r, verse(r)]))
    );
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

  it("drops references not in the local corpus (hallucinated)", async () => {
    mockCallAI.mockResolvedValue(
      JSON.stringify([
        { ref: "2:255", reason: "real" },
        { ref: "9:999", reason: "fake" },
      ])
    );
    mockGetVerses.mockImplementation(
      async (refs: string[]) => new Map(refs.filter((r) => r !== "9:999").map((r) => [r, verse(r)]))
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

  it("logs when the AI response contains no JSON array", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      mockCallAI.mockResolvedValue("Sorry, I cannot help with that.");
      const out = await generateConnections("1:1", "ar", "tr", "thematic");
      expect(out).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("no JSON array"),
        expect.stringContaining("Sorry, I cannot help")
      );
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("logs when the AI response's JSON array is malformed", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      mockCallAI.mockResolvedValue("[{ not: valid json }]");
      const out = await generateConnections("1:1", "ar", "tr", "thematic");
      expect(out).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("failed to parse"),
        expect.stringContaining("not: valid json"),
        expect.any(Error)
      );
    } finally {
      consoleErrorSpy.mockRestore();
    }
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

  it("omits any language directive and keeps the Tanzih rule for the default (English) locale", async () => {
    mockCallAI.mockResolvedValue(JSON.stringify([{ ref: "2:255", reason: "x" }]));
    await generateConnections("1:1", "ar", "tr", "thematic");
    const prompt = mockCallAI.mock.calls[0][0] as string;
    expect(prompt).not.toMatch(/write each "reason" in/i);
    expect(prompt).toMatch(/strict tanzih/i);
  });

  it("appends a language directive for a non-English locale without dropping the Tanzih rule", async () => {
    mockCallAI.mockResolvedValue(JSON.stringify([{ ref: "2:255", reason: "x" }]));
    await generateConnections("1:1", "ar", "tr", "thematic", "tr");
    const prompt = mockCallAI.mock.calls[0][0] as string;
    expect(prompt).toMatch(/write each "reason" in turkish/i);
    expect(prompt).toMatch(/strict tanzih/i);
  });

  it("keeps the Tanzih constraint even when an admin's prompt override omits it entirely", async () => {
    // Simulates a DB-stored prompt_versions override that dropped the Tanzih
    // rule (with or without intent) — the constraint must still reach the
    // model, since it's appended after the resolved template, not baked into it.
    vi.mocked(getPrompt).mockResolvedValueOnce({
      template: `You are a helpful assistant.
Reference: {{fromRef}}
Task: {{task}}
Return ONLY a valid JSON array of { "ref": "surah:ayah", "reason": "..." }.`,
      version: 7,
    });
    mockCallAI.mockResolvedValue(JSON.stringify([{ ref: "2:255", reason: "x" }]));
    await generateConnections("1:1", "ar", "tr", "thematic");
    const prompt = mockCallAI.mock.calls[0][0] as string;
    expect(prompt).not.toMatch(/you are a classical islamic scholar/i);
    expect(prompt).toMatch(/strict tanzih/i);
  });

  it("forwards the provider override and logs the returned model + combined tokens", async () => {
    mockCallAIDetailed.mockResolvedValue({
      text: JSON.stringify([{ ref: "2:255", reason: "x" }]),
      usage: { inputTokens: 1234, outputTokens: 56 },
      provider: "gemini" as const,
      model: "gemini-3.5-flash-lite",
    });
    await generateConnections("1:1", "ar", "tr", "thematic", "en", { provider: "gemini" });

    expect(mockCallAIDetailed).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ feature: "connections", provider: "gemini" })
    );
    expect(insertedRows).toContainEqual(
      expect.objectContaining({ model: "gemini-3.5-flash-lite", tokens: 1290 })
    );
  });
});

describe("generateGroundedConnections", () => {
  beforeEach(() => {
    mockCallAI.mockReset();
    mockCallAIDetailed.mockReset().mockImplementation(defaultDetailed);
    insertedRows.length = 0;
    mockInsert.mockClear();
    mockGetVerses.mockReset();
    // Default: every requested candidate ref resolves to a verse.
    mockGetVerses.mockImplementation(
      async (refs: string[]) => new Map(refs.map((r) => [r, verse(r)]))
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
    const out = await generateGroundedConnections("1:1", "ar", "tr", "root", ["2:255", "3:18"]);
    expect(out.map((c) => c.ref)).toEqual(["2:255"]);
  });

  it("never returns the source verse even if the model picks it", async () => {
    mockCallAI.mockResolvedValue(
      JSON.stringify([
        { ref: "1:1", reason: "self" },
        { ref: "2:255", reason: "valid" },
      ])
    );
    const out = await generateGroundedConnections("1:1", "ar", "tr", "contrast", ["2:255"]);
    expect(out.map((c) => c.ref)).toEqual(["2:255"]);
  });

  it("returns [] without calling the AI when no candidate verse resolves", async () => {
    mockGetVerses.mockResolvedValue(new Map());
    const out = await generateGroundedConnections("1:1", "ar", "tr", "thematic", ["2:255"]);
    expect(out).toEqual([]);
    expect(mockCallAI).not.toHaveBeenCalled();
  });

  it("logs exactly one ai_generations row per grounded generation", async () => {
    mockCallAI.mockResolvedValue(JSON.stringify([{ ref: "2:255", reason: "x" }]));
    await generateGroundedConnections("1:1", "ar", "tr", "root", ["2:255"]);
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it("omits any language directive and keeps the Tanzih rule for the default (English) locale", async () => {
    mockCallAI.mockResolvedValue(JSON.stringify([{ ref: "2:255", reason: "x" }]));
    await generateGroundedConnections("1:1", "ar", "tr", "thematic", ["2:255"]);
    const prompt = mockCallAI.mock.calls[0][0] as string;
    expect(prompt).not.toMatch(/write each "reason" in/i);
    expect(prompt).toMatch(/strict tanzih/i);
  });

  it("appends a language directive for a non-English locale without dropping the Tanzih rule", async () => {
    mockCallAI.mockResolvedValue(JSON.stringify([{ ref: "2:255", reason: "x" }]));
    await generateGroundedConnections("1:1", "ar", "tr", "thematic", ["2:255"], "ru");
    const prompt = mockCallAI.mock.calls[0][0] as string;
    expect(prompt).toMatch(/write each "reason" in russian/i);
    expect(prompt).toMatch(/strict tanzih/i);
  });

  it("forwards the provider override and logs the returned model + combined tokens", async () => {
    mockCallAIDetailed.mockResolvedValue({
      text: JSON.stringify([{ ref: "2:255", reason: "x" }]),
      usage: { inputTokens: 900, outputTokens: 100 },
      provider: "gemini" as const,
      model: "gemini-3.5-flash-lite",
    });
    await generateGroundedConnections("1:1", "ar", "tr", "root", ["2:255"], "en", {
      provider: "gemini",
    });

    expect(mockCallAIDetailed).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ feature: "connections", provider: "gemini" })
    );
    expect(insertedRows).toContainEqual(
      expect.objectContaining({ model: "gemini-3.5-flash-lite", tokens: 1000 })
    );
  });
});
