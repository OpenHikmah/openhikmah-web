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

import {
  generateConnections,
  generateGroundedConnections,
  ConnectionParseError,
} from "@/lib/ai/connection-generator";
import { getPrompt } from "@/lib/ai/prompt-registry";

// Sacred-data rule (AGENTS.md): plausible Arabic + a real translation even in
// fixtures. Al-Fatiha 1:1.
const SOURCE_AR = "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ";
const SOURCE_TR = "In the name of Allah, the Entirely Merciful, the Especially Merciful.";

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
        { ref: "2:255", reason: "Describes God's throne and encompassing knowledge." },
        { ref: "3:18", reason: "Both verses bear witness to the oneness of God." },
        { ref: "112:1", reason: "Both affirm the pure, absolute oneness of God." },
      ])
    );
    const out = await generateConnections("1:1", SOURCE_AR, SOURCE_TR, "thematic");
    // One generation call, one verification call over the 3 survivors.
    expect(mockCallAI).toHaveBeenCalledTimes(2);
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({
      ref: "2:255",
      reason: "Describes God's throne and encompassing knowledge.",
      kind: "thematic",
    });
  });

  it("logs exactly one ai_generations row per generation", async () => {
    mockCallAI.mockResolvedValue(JSON.stringify([{ ref: "2:255", reason: "x" }]));
    await generateConnections("1:1", SOURCE_AR, SOURCE_TR, "root");
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it("drops references not in the local corpus (hallucinated)", async () => {
    mockCallAI.mockResolvedValue(
      JSON.stringify([
        { ref: "2:255", reason: "A genuinely grounded thematic connection." },
        { ref: "9:999", reason: "A hallucinated reference that does not exist." },
      ])
    );
    mockGetVerses.mockImplementation(
      async (refs: string[]) => new Map(refs.filter((r) => r !== "9:999").map((r) => [r, verse(r)]))
    );
    const out = await generateConnections("1:1", SOURCE_AR, SOURCE_TR, "thematic");
    expect(out.map((c) => c.ref)).toEqual(["2:255"]);
  });

  it("drops syntactically invalid refs and the source ref itself", async () => {
    mockCallAI.mockResolvedValue(
      JSON.stringify([
        { ref: "1:1", reason: "This is the source verse itself, must be dropped." },
        { ref: "999:1", reason: "This reference is out of bounds for any surah." },
        { ref: "garbage", reason: "This reference is malformed and unparseable." },
        { ref: "2:255", reason: "A genuine contrast between hardship and ease." },
      ])
    );
    const out = await generateConnections("1:1", SOURCE_AR, SOURCE_TR, "contrast");
    expect(out.map((c) => c.ref)).toEqual(["2:255"]);
  });

  it("throws ConnectionParseError when the AI returns no JSON array (e.g. a refusal)", async () => {
    mockCallAI.mockResolvedValue("Sorry, I cannot help with that.");
    await expect(
      generateConnections("1:1", SOURCE_AR, SOURCE_TR, "thematic")
    ).rejects.toBeInstanceOf(ConnectionParseError);
  });

  it("throws ConnectionParseError when the JSON array is malformed", async () => {
    mockCallAI.mockResolvedValue("[{ not: valid json }]");
    await expect(
      generateConnections("1:1", SOURCE_AR, SOURCE_TR, "thematic")
    ).rejects.toBeInstanceOf(ConnectionParseError);
  });

  it("throws ConnectionParseError when the response JSON is not an array", async () => {
    mockCallAI.mockResolvedValue('{ "ref": "2:255", "reason": "x" }');
    await expect(
      generateConnections("1:1", SOURCE_AR, SOURCE_TR, "thematic")
    ).rejects.toBeInstanceOf(ConnectionParseError);
  });

  it("throws ConnectionParseError when every entry has a blank reason", async () => {
    mockCallAI.mockResolvedValue(
      JSON.stringify([
        { ref: "2:255", reason: "" },
        { ref: "3:18", reason: "   " },
      ])
    );
    await expect(
      generateConnections("1:1", SOURCE_AR, SOURCE_TR, "thematic")
    ).rejects.toBeInstanceOf(ConnectionParseError);
  });

  it("drops entries with a blank reason but keeps the well-formed ones", async () => {
    mockCallAI.mockResolvedValue(
      JSON.stringify([
        { ref: "2:255", reason: "A fully grounded theological explanation here." },
        { ref: "3:18", reason: "" },
      ])
    );
    const out = await generateConnections("1:1", SOURCE_AR, SOURCE_TR, "thematic");
    expect(out.map((c) => c.ref)).toEqual(["2:255"]);
  });

  it("returns [] (no throw) when the model well-formedly selects nothing", async () => {
    mockCallAI.mockResolvedValue("[]");
    const out = await generateConnections("1:1", SOURCE_AR, SOURCE_TR, "thematic");
    expect(out).toEqual([]);
  });

  it("caps at 3 connections even if the model returns more", async () => {
    mockCallAI.mockResolvedValue(
      JSON.stringify([
        { ref: "2:1", reason: "Shares the theme of guidance for the righteous." },
        { ref: "2:2", reason: "Shares the theme of certainty in the unseen." },
        { ref: "2:3", reason: "Shares the theme of establishing regular prayer." },
        { ref: "2:4", reason: "Shares the theme of belief in prior revelation." },
      ])
    );
    const out = await generateConnections("1:1", SOURCE_AR, SOURCE_TR, "thematic");
    expect(out).toHaveLength(3);
  });

  it("omits any language directive and keeps the Tanzih rule for the default (English) locale", async () => {
    mockCallAI.mockResolvedValue(JSON.stringify([{ ref: "2:255", reason: "x" }]));
    await generateConnections("1:1", SOURCE_AR, SOURCE_TR, "thematic");
    const prompt = mockCallAI.mock.calls[0][0] as string;
    expect(prompt).not.toMatch(/write each "reason" in/i);
    expect(prompt).toMatch(/strict tanzih/i);
  });

  it("appends a language directive for a non-English locale without dropping the Tanzih rule", async () => {
    mockCallAI.mockResolvedValue(JSON.stringify([{ ref: "2:255", reason: "x" }]));
    await generateConnections("1:1", SOURCE_AR, SOURCE_TR, "thematic", "tr");
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
    await generateConnections("1:1", SOURCE_AR, SOURCE_TR, "thematic");
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
    await generateConnections("1:1", SOURCE_AR, SOURCE_TR, "thematic", "en", {
      provider: "gemini",
      model: "gemini-3.7-flash",
    });

    expect(mockCallAIDetailed).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        feature: "connections",
        provider: "gemini",
        model: "gemini-3.7-flash",
      })
    );
    expect(insertedRows).toContainEqual(
      expect.objectContaining({ model: "gemini-3.5-flash-lite", tokens: 1290 })
    );
  });
});

describe("generateConnections — content quality gate", () => {
  beforeEach(() => {
    mockCallAI.mockReset();
    mockCallAIDetailed.mockReset().mockImplementation(defaultDetailed);
    insertedRows.length = 0;
    mockInsert.mockClear();
    mockGetVerses.mockReset();
    mockGetVerses.mockImplementation(
      async (refs: string[]) => new Map(refs.map((r) => [r, verse(r)]))
    );
  });

  it("rejects a reason that is too short to be a real justification", async () => {
    mockCallAI.mockResolvedValue(JSON.stringify([{ ref: "2:255", reason: "ok" }]));
    const out = await generateConnections("1:1", SOURCE_AR, SOURCE_TR, "thematic");
    expect(out).toEqual([]);
  });

  it("rejects a reason with Tashbih-adjacent phrasing even if otherwise well-formed", async () => {
    mockCallAI.mockResolvedValue(
      JSON.stringify([
        { ref: "2:255", reason: "This verse shows God literally has a physical body." },
      ])
    );
    const out = await generateConnections("1:1", SOURCE_AR, SOURCE_TR, "thematic");
    expect(out).toEqual([]);
  });

  it("rejects a reason that mostly just restates the candidate verse's translation", async () => {
    mockGetVerses.mockImplementation(
      async (refs: string[]) =>
        new Map(
          refs.map((r) => [
            r,
            {
              ...verse(r),
              translation:
                "Allah is the light of the heavens and the earth, a parable of His light.",
            },
          ])
        )
    );
    mockCallAI.mockResolvedValue(
      JSON.stringify([
        {
          ref: "2:255",
          reason: "Allah is the light of the heavens and the earth, a parable of His light.",
        },
      ])
    );
    const out = await generateConnections("1:1", SOURCE_AR, SOURCE_TR, "thematic");
    expect(out).toEqual([]);
  });

  it("rejects a candidate whose model-reported confidence is below the threshold", async () => {
    mockCallAI.mockResolvedValue(
      JSON.stringify([
        {
          ref: "2:255",
          reason: "A plausible but genuinely uncertain thematic link here.",
          confidence: 10,
        },
      ])
    );
    const out = await generateConnections("1:1", SOURCE_AR, SOURCE_TR, "thematic");
    expect(out).toEqual([]);
  });

  it("keeps a candidate when confidence is absent — not threshold-checked", async () => {
    mockCallAI.mockResolvedValue(
      JSON.stringify([{ ref: "2:255", reason: "A well-formed connection with no confidence." }])
    );
    const out = await generateConnections("1:1", SOURCE_AR, SOURCE_TR, "thematic");
    expect(out.map((c) => c.ref)).toEqual(["2:255"]);
  });

  it("rejects a candidate whose reason is redundant with an already-active connection", async () => {
    mockCallAI.mockResolvedValue(
      JSON.stringify([
        {
          ref: "2:255",
          reason: "God's mercy and forgiveness extend to every sincere repentant.",
        },
      ])
    );
    const out = await generateConnections("1:1", SOURCE_AR, SOURCE_TR, "thematic", "en", {
      existingReasons: ["God's mercy and forgiveness extend to every sincere repentant soul."],
    });
    expect(out).toEqual([]);
  });

  it("drops a candidate the verification pass flags invalid, keeps the rest", async () => {
    mockCallAIDetailed
      .mockResolvedValueOnce({
        text: JSON.stringify([
          { ref: "2:255", reason: "A genuinely strong thematic connection here." },
          { ref: "3:18", reason: "A weaker but structurally well-formed connection." },
        ]),
        usage: { inputTokens: 100, outputTokens: 20 },
        provider: "claude" as const,
        model: "claude-opus-4-7",
      })
      .mockResolvedValueOnce({
        text: JSON.stringify([
          { ref: "2:255", valid: true },
          { ref: "3:18", valid: false },
        ]),
        usage: { inputTokens: 50, outputTokens: 10 },
        provider: "claude" as const,
        model: "claude-opus-4-7",
      });
    const out = await generateConnections("1:1", SOURCE_AR, SOURCE_TR, "thematic");
    expect(out.map((c) => c.ref)).toEqual(["2:255"]);
    expect(mockCallAIDetailed).toHaveBeenCalledTimes(2);
  });

  it("skips verification (no extra call) when the batch job's budget is exhausted", async () => {
    mockCallAI.mockResolvedValue(
      JSON.stringify([{ ref: "2:255", reason: "A well-formed connection worth persisting." }])
    );
    const out = await generateConnections("1:1", SOURCE_AR, SOURCE_TR, "thematic", "en", {
      spendBudget: () => false,
    });
    expect(out.map((c) => c.ref)).toEqual(["2:255"]);
    expect(mockCallAIDetailed).toHaveBeenCalledTimes(1);
  });

  it("fails open — keeps candidates when the verification response can't be parsed", async () => {
    mockCallAIDetailed
      .mockResolvedValueOnce({
        text: JSON.stringify([
          { ref: "2:255", reason: "A well-formed connection worth persisting." },
        ]),
        usage: { inputTokens: 100, outputTokens: 20 },
        provider: "claude" as const,
        model: "claude-opus-4-7",
      })
      .mockResolvedValueOnce({
        text: "I refuse to review this.",
        usage: null,
        provider: "claude" as const,
        model: "claude-opus-4-7",
      });
    const out = await generateConnections("1:1", SOURCE_AR, SOURCE_TR, "thematic");
    expect(out.map((c) => c.ref)).toEqual(["2:255"]);
  });

  it("skips verification entirely (no call, no spend) when nothing survives the gate", async () => {
    mockCallAI.mockResolvedValue(JSON.stringify([{ ref: "2:255", reason: "too short" }]));
    const spendBudget = vi.fn(() => true);
    const out = await generateConnections("1:1", SOURCE_AR, SOURCE_TR, "thematic", "en", {
      spendBudget,
    });
    expect(out).toEqual([]);
    expect(spendBudget).not.toHaveBeenCalled();
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
        { ref: "2:255", reason: "Describes the throne verse and God's knowledge." },
        { ref: "3:18", reason: "Both verses bear witness to the oneness of God." },
      ])
    );
    const out = await generateGroundedConnections("1:1", SOURCE_AR, SOURCE_TR, "thematic", [
      "2:255",
      "3:18",
      "112:1",
    ]);
    expect(out.map((c) => c.ref)).toEqual(["2:255", "3:18"]);
    expect(out[0]).toMatchObject({
      reason: "Describes the throne verse and God's knowledge.",
      kind: "thematic",
    });
  });

  it("rejects any ref the model returns that was not in the candidate set", async () => {
    mockCallAI.mockResolvedValue(
      JSON.stringify([
        { ref: "2:255", reason: "This candidate genuinely is in the offered set." },
        { ref: "9:99", reason: "NOT a candidate — must be dropped regardless of text." },
      ])
    );
    const out = await generateGroundedConnections("1:1", SOURCE_AR, SOURCE_TR, "root", [
      "2:255",
      "3:18",
    ]);
    expect(out.map((c) => c.ref)).toEqual(["2:255"]);
  });

  it("never returns the source verse even if the model picks it", async () => {
    mockCallAI.mockResolvedValue(
      JSON.stringify([
        { ref: "1:1", reason: "This is the source verse itself, must be dropped." },
        { ref: "2:255", reason: "A genuinely valid contrasting connection here." },
      ])
    );
    const out = await generateGroundedConnections("1:1", SOURCE_AR, SOURCE_TR, "contrast", [
      "2:255",
    ]);
    expect(out.map((c) => c.ref)).toEqual(["2:255"]);
  });

  it("returns [] without calling the AI when no candidate verse resolves", async () => {
    mockGetVerses.mockResolvedValue(new Map());
    const out = await generateGroundedConnections("1:1", SOURCE_AR, SOURCE_TR, "thematic", [
      "2:255",
    ]);
    expect(out).toEqual([]);
    expect(mockCallAI).not.toHaveBeenCalled();
  });

  it("throws ConnectionParseError on an unparseable grounded response", async () => {
    mockCallAI.mockResolvedValue("I can't assist with that request.");
    await expect(
      generateGroundedConnections("1:1", SOURCE_AR, SOURCE_TR, "thematic", ["2:255"])
    ).rejects.toBeInstanceOf(ConnectionParseError);
  });

  it("returns [] (no throw) when the model well-formedly picks none of the candidates", async () => {
    mockCallAI.mockResolvedValue("[]");
    const out = await generateGroundedConnections("1:1", SOURCE_AR, SOURCE_TR, "thematic", [
      "2:255",
    ]);
    expect(out).toEqual([]);
  });

  it("logs exactly one ai_generations row per grounded generation", async () => {
    mockCallAI.mockResolvedValue(JSON.stringify([{ ref: "2:255", reason: "x" }]));
    await generateGroundedConnections("1:1", SOURCE_AR, SOURCE_TR, "root", ["2:255"]);
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it("omits any language directive and keeps the Tanzih rule for the default (English) locale", async () => {
    mockCallAI.mockResolvedValue(JSON.stringify([{ ref: "2:255", reason: "x" }]));
    await generateGroundedConnections("1:1", SOURCE_AR, SOURCE_TR, "thematic", ["2:255"]);
    const prompt = mockCallAI.mock.calls[0][0] as string;
    expect(prompt).not.toMatch(/write each "reason" in/i);
    expect(prompt).toMatch(/strict tanzih/i);
  });

  it("appends a language directive for a non-English locale without dropping the Tanzih rule", async () => {
    mockCallAI.mockResolvedValue(JSON.stringify([{ ref: "2:255", reason: "x" }]));
    await generateGroundedConnections("1:1", SOURCE_AR, SOURCE_TR, "thematic", ["2:255"], "ru");
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
    await generateGroundedConnections("1:1", SOURCE_AR, SOURCE_TR, "root", ["2:255"], "en", {
      provider: "gemini",
      model: "gemini-3.7-flash",
    });

    expect(mockCallAIDetailed).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        feature: "connections",
        provider: "gemini",
        model: "gemini-3.7-flash",
      })
    );
    expect(insertedRows).toContainEqual(
      expect.objectContaining({ model: "gemini-3.5-flash-lite", tokens: 1000 })
    );
  });
});
