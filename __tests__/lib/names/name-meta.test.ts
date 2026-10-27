import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetOrGenerate, mockTranslate, mockIncr } = vi.hoisted(() => ({
  mockGetOrGenerate: vi.fn(),
  mockTranslate: vi.fn(),
  mockIncr: vi.fn(),
}));

vi.mock("@/lib/names/name-content", () => ({
  getOrGenerateNameContent: mockGetOrGenerate,
  hashNameSource: (s: string) => `hash:${s}`,
}));
vi.mock("@/lib/ai/translate", () => ({ translateReason: mockTranslate }));
vi.mock("@/lib/infra/metrics", () => ({ incr: mockIncr }));

import { getLocalizedNameField, META_VERSION } from "@/lib/names/name-meta";

const markRefusal = vi.fn();
const ctx = { provider: "gemini", model: "gemini-test", markRefusal };

// Positional arguments of getOrGenerateNameContent.
const GENERATE = 4;
const IS_EMPTY = 5;

beforeEach(() => {
  mockGetOrGenerate.mockReset();
  mockTranslate.mockReset();
  mockIncr.mockReset();
  markRefusal.mockReset();
  mockGetOrGenerate.mockResolvedValue("Mərhəmətli");
});

describe("getLocalizedNameField", () => {
  it("returns the canonical English with no cache or AI round trip", async () => {
    const out = await getLocalizedNameField("ar-rahman", "meaning", "The Most Merciful", "en");
    expect(out).toBe("The Most Merciful");
    expect(mockGetOrGenerate).not.toHaveBeenCalled();
  });

  it("looks the translation up by slug, field, locale and version, keyed on the source hash", async () => {
    const before = vi.fn();
    const out = await getLocalizedNameField(
      "ar-rahman",
      "description",
      "The Entirely Merciful",
      "az",
      before
    );
    expect(out).toBe("Mərhəmətli");
    const args = mockGetOrGenerate.mock.calls[0];
    expect(args.slice(0, 4)).toEqual(["ar-rahman", "description", "az", META_VERSION]);
    expect(args[6]).toBe(before);
    expect(args[7]).toBe("hash:The Entirely Merciful");
  });

  it("translates `meaning` with a widened length-ratio guard and `description` with the default", async () => {
    mockTranslate.mockResolvedValue("x");
    await getLocalizedNameField("al-ahad", "meaning", "The One", "tr");
    await mockGetOrGenerate.mock.calls[0][GENERATE](ctx);
    expect(mockTranslate).toHaveBeenLastCalledWith(
      "The One",
      "Turkish",
      { feature: "names", provider: "gemini", model: "gemini-test" },
      expect.any(Function),
      { maxLengthRatio: 8 }
    );

    await getLocalizedNameField("al-ahad", "description", "He is One.", "ru");
    await mockGetOrGenerate.mock.calls[1][GENERATE](ctx);
    expect(mockTranslate).toHaveBeenLastCalledWith(
      "He is One.",
      "Russian",
      expect.any(Object),
      expect.any(Function),
      undefined
    );
  });

  it("flags a model refusal so the result is not silently backed by Gemini", async () => {
    mockTranslate.mockImplementation(async (_t, _l, _o, onReason: (r: string) => void) => {
      onReason("refusal");
      return "";
    });
    await getLocalizedNameField("al-ahad", "meaning", "The One", "tr");
    await mockGetOrGenerate.mock.calls[0][GENERATE](ctx);
    expect(markRefusal).toHaveBeenCalledTimes(1);

    markRefusal.mockReset();
    mockTranslate.mockImplementation(async (_t, _l, _o, onReason: (r: string) => void) => {
      onReason("length");
      return "x";
    });
    await mockGetOrGenerate.mock.calls[0][GENERATE](ctx);
    expect(markRefusal).not.toHaveBeenCalled();
  });

  it("logs, counts and yields an empty string when the translation call throws", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    mockTranslate.mockRejectedValue(new Error("boom"));
    await getLocalizedNameField("al-ahad", "meaning", "The One", "tr");
    await expect(mockGetOrGenerate.mock.calls[0][GENERATE](ctx)).resolves.toBe("");
    expect(mockIncr).toHaveBeenCalledWith("names_ai_call_error");
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it("treats a blank generation as unusable so it is never cached", async () => {
    await getLocalizedNameField("al-ahad", "meaning", "The One", "tr");
    const isEmpty = mockGetOrGenerate.mock.calls[0][IS_EMPTY] as (s: string) => boolean;
    expect(isEmpty("   ")).toBe(true);
    expect(isEmpty("Bir")).toBe(false);
  });

  it("falls back to the vetted canonical text when the translation comes back blank", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    mockGetOrGenerate.mockResolvedValue("  ");
    const out = await getLocalizedNameField("al-ahad", "meaning", "The One", "tr");
    expect(out).toBe("The One");
    expect(err).toHaveBeenCalledWith(expect.stringContaining("al-ahad/meaning/tr"));
    err.mockRestore();
  });
});
