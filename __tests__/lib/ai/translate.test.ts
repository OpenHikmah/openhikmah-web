import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockCallAI } = vi.hoisted(() => ({ mockCallAI: vi.fn() }));
vi.mock("@/lib/ai/ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/ai")>()),
  callAI: (prompt: string, opts?: unknown) => mockCallAI(prompt, opts),
}));

import { validateTranslation, translateReason } from "@/lib/ai/translate";
import * as metrics from "@/lib/infra/metrics";

const EN = "The believer rests the heart in certainty of Allah's subtle awareness.";

describe("validateTranslation", () => {
  it("accepts a plausible localized sentence", () => {
    const v = validateTranslation(EN, "Mümin, kalbini Allah'ın latif ilminin yakinine bırakır.");
    expect(v).toEqual({
      ok: true,
      text: "Mümin, kalbini Allah'ın latif ilminin yakinine bırakır.",
    });
  });

  it("strips a leading label wrapper and accepts the remainder", () => {
    const v = validateTranslation(EN, "Translation: Mümin kalbini yakine bırakır.");
    expect(v).toEqual({ ok: true, text: "Mümin kalbini yakine bırakır." });
  });

  it("rejects output that is only a label", () => {
    expect(validateTranslation(EN, "Sure! Here is the translation:")).toEqual({
      ok: false,
      reason: "label-prefix",
    });
  });

  it("rejects a refusal, including one behind a label wrapper", () => {
    expect(validateTranslation(EN, "I can't help with that request.")).toEqual({
      ok: false,
      reason: "refusal",
    });
    expect(
      validateTranslation(EN, "Sure! Here is the translation: I cannot assist with this.")
    ).toEqual({ ok: false, reason: "refusal" });
  });

  it("rejects a verbatim English echo for a non-English locale (case-insensitive)", () => {
    expect(validateTranslation(EN, EN)).toEqual({ ok: false, reason: "english-echo" });
    expect(validateTranslation(EN, EN.toUpperCase())).toEqual({
      ok: false,
      reason: "english-echo",
    });
  });

  it("rejects a wildly long translation", () => {
    expect(validateTranslation(EN, EN.repeat(4))).toEqual({
      ok: false,
      reason: "length-ratio",
    });
  });

  it("rejects a translation far too short for a non-trivial source", () => {
    expect(validateTranslation(EN, "Evet.")).toEqual({ ok: false, reason: "length-ratio" });
  });

  it("does not apply the short-ratio floor to a very short source", () => {
    expect(validateTranslation("He is near.", "Yakın.")).toEqual({
      ok: true,
      text: "Yakın.",
    });
  });
});

describe("translateReason", () => {
  beforeEach(() => {
    mockCallAI.mockReset();
    vi.restoreAllMocks();
  });

  it("returns the trimmed translation on a clean result", async () => {
    mockCallAI.mockResolvedValue("  Mümin kalbini yakine bırakır.  ");
    await expect(translateReason(EN, "Turkish")).resolves.toBe("Mümin kalbini yakine bırakır.");
  });

  it("returns '' and meters the rejection when the model refuses", async () => {
    const incrSpy = vi.spyOn(metrics, "incr");
    mockCallAI.mockResolvedValue("I'm sorry, but I can't translate religious content.");

    await expect(translateReason(EN, "Turkish")).resolves.toBe("");
    expect(incrSpy).toHaveBeenCalledWith("translation_rejected_refusal");
  });

  it("returns '' for an empty model result without metering a rejection", async () => {
    const incrSpy = vi.spyOn(metrics, "incr");
    mockCallAI.mockResolvedValue("   ");

    await expect(translateReason(EN, "Turkish")).resolves.toBe("");
    expect(incrSpy).not.toHaveBeenCalled();
  });

  it("returns '' and meters when the model echoes the English source", async () => {
    const incrSpy = vi.spyOn(metrics, "incr");
    mockCallAI.mockResolvedValue(EN);

    await expect(translateReason(EN, "Russian")).resolves.toBe("");
    expect(incrSpy).toHaveBeenCalledWith("translation_rejected_english-echo");
  });
});
