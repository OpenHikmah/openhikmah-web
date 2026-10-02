import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockCallAI } = vi.hoisted(() => ({ mockCallAI: vi.fn() }));
vi.mock("@/lib/ai/ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/ai")>()),
  callAI: (prompt: string, opts?: unknown) => mockCallAI(prompt, opts),
}));

import {
  validateTranslation,
  translateReason,
  TranslationBudgetExhaustedError,
} from "@/lib/ai/translate";
import { GeminiDailyQuotaError } from "@/lib/ai/gemini-errors";
import { TANZIH_CONSTRAINT } from "@/lib/ai/theological-constraints";
import * as metrics from "@/lib/infra/metrics";

const EN = "The believer rests the heart in certainty of Allah's subtle awareness.";

describe("validateTranslation", () => {
  it("rejects output carrying English Tashbih phrasing", () => {
    expect(validateTranslation(EN, "Mümin bilir ki Allah literally has a physical body.")).toEqual({
      ok: false,
      reason: "tashbih",
    });
  });

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
      reason: "label_prefix",
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

  it("rejects an English echo despite re-punctuation / re-casing", () => {
    expect(validateTranslation(EN, EN)).toEqual({ ok: false, reason: "english_echo" });
    expect(validateTranslation(EN, EN.toUpperCase())).toEqual({
      ok: false,
      reason: "english_echo",
    });
    expect(
      validateTranslation(
        EN,
        `"The believer  rests the heart in certainty of Allah's subtle awareness"`
      )
    ).toEqual({ ok: false, reason: "english_echo" });
  });

  it("rejects a wildly long translation", () => {
    expect(validateTranslation(EN, EN.repeat(4))).toEqual({
      ok: false,
      reason: "length_ratio",
    });
  });

  it("rejects a translation far too short for a non-trivial source", () => {
    expect(validateTranslation(EN, "Evet.")).toEqual({ ok: false, reason: "length_ratio" });
  });

  it("does not apply the short-ratio floor to a very short source", () => {
    expect(validateTranslation("He is near.", "Yakın.")).toEqual({
      ok: true,
      text: "Yakın.",
    });
  });
});

/** Answers the translation prompt with `translation` and the meaning check with approvals. */
function translating(translation: string) {
  mockCallAI.mockImplementation(async (prompt: string) => {
    if (prompt.startsWith("Render the following")) return "A faithful English rendering.";
    if (prompt.includes("comparing two English sentences")) return '{ "same": true }';
    return translation;
  });
}

describe("translateReason", () => {
  beforeEach(() => {
    mockCallAI.mockReset();
    vi.restoreAllMocks();
  });

  it("returns the trimmed translation on a clean result", async () => {
    translating("  Mümin kalbini yakine bırakır.  ");
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
    expect(incrSpy).toHaveBeenCalledWith("translation_rejected_english_echo");
  });

  it("calls onRejected with the specific reason on a refusal", async () => {
    mockCallAI.mockResolvedValue("I'm sorry, but I can't translate religious content.");
    const onRejected = vi.fn();

    await translateReason(EN, "Turkish", {}, onRejected);

    expect(onRejected).toHaveBeenCalledWith("refusal");
  });

  it("calls onRejected with a non-refusal reason for an English echo, not 'refusal'", async () => {
    mockCallAI.mockResolvedValue(EN);
    const onRejected = vi.fn();

    await translateReason(EN, "Russian", {}, onRejected);

    expect(onRejected).toHaveBeenCalledWith("english_echo");
  });

  it("does not call onRejected on a clean, accepted translation", async () => {
    translating("Mümin kalbini yakine bırakır.");
    const onRejected = vi.fn();

    await translateReason(EN, "Turkish", {}, onRejected);

    expect(onRejected).not.toHaveBeenCalled();
  });

  it("does not call onRejected for an empty model result (not a rejection)", async () => {
    mockCallAI.mockResolvedValue("   ");
    const onRejected = vi.fn();

    await translateReason(EN, "Turkish", {}, onRejected);

    expect(onRejected).not.toHaveBeenCalled();
  });
});

describe("translateReason — back-translation meaning check", () => {
  const TR = "Mümin kalbini yakine bırakır.";
  const BACK = "The believer rests the heart in certainty.";

  /** Translation prompt → TR; back-translation prompt → `back`; comparison prompt → `compare`. */
  function scripted(back: string | Error, compare: string | Error) {
    mockCallAI.mockImplementation(async (prompt: string) => {
      const reply = prompt.startsWith("Render the following")
        ? back
        : prompt.includes("comparing two English sentences")
          ? compare
          : TR;
      if (reply instanceof Error) throw reply;
      return reply;
    });
  }

  beforeEach(() => {
    mockCallAI.mockReset();
    vi.restoreAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("back-translates WITHOUT the English source, then compares against it, in three calls", async () => {
    scripted(BACK, '{ "same": true }');
    const opts = { feature: "names" as const, provider: "claude" as const, model: "m" };

    await expect(translateReason(EN, "Turkish", opts)).resolves.toBe(TR);

    expect(mockCallAI).toHaveBeenCalledTimes(3);
    const [, backCall, compareCall] = mockCallAI.mock.calls;
    // The back-translation sees only the translated text, so it cannot echo the source.
    expect(backCall[0]).toContain(TR);
    expect(backCall[0]).not.toContain(EN);
    // The comparison sees the canonical source and the back-translation.
    expect(compareCall[0]).toContain(EN);
    expect(compareCall[0]).toContain(BACK);
    expect(compareCall[0]).toContain(TANZIH_CONSTRAINT);
    // Every call uses the same options (provider/model/key/signal).
    for (const call of mockCallAI.mock.calls) expect(call[1]).toEqual(opts);
  });

  it("rejects a translation whose meaning drifted (same:false), metered, with a non-refusal reason", async () => {
    scripted("The believer doubts Allah's awareness.", '{ "same": false }');
    const incrSpy = vi.spyOn(metrics, "incr");
    const onRejected = vi.fn();

    await expect(translateReason(EN, "Turkish", {}, onRejected)).resolves.toBe("");

    expect(onRejected).toHaveBeenCalledWith("meaning_drift");
    expect(incrSpy).toHaveBeenCalledWith("translation_rejected_meaning_drift");
  });

  it.each([
    ["a missing verdict", '{ "note": "fine" }', "verification_failed"],
    ["a string verdict", '{ "same": "true" }', "verification_failed"],
    ["prose with no JSON", "Yes, they match.", "verification_failed"],
    ["invalid JSON", "{ same: true", "verification_failed"],
  ])("does not approve %s", async (_label, compare, reason) => {
    scripted(BACK, compare);
    const onRejected = vi.fn();
    await expect(translateReason(EN, "Turkish", {}, onRejected)).resolves.toBe("");
    expect(onRejected).toHaveBeenCalledWith(reason);
  });

  it("an empty back-translation is a failed check, not an approval", async () => {
    scripted("   ", '{ "same": true }');
    const onRejected = vi.fn();
    await expect(translateReason(EN, "Turkish", {}, onRejected)).resolves.toBe("");
    expect(onRejected).toHaveBeenCalledWith("verification_failed");
    // The comparison is never asked of an empty back-translation.
    expect(mockCallAI).toHaveBeenCalledTimes(2);
  });

  it("a refusal from either check call is reported as a refusal, so callers can stop a Gemini fallback", async () => {
    for (const [back, compare] of [
      ["I'm sorry, but I can't help with that.", '{ "same": true }'],
      [BACK, "I'm sorry, but I can't help with that."],
    ]) {
      mockCallAI.mockReset();
      scripted(back, compare);
      const onRejected = vi.fn();
      await expect(translateReason(EN, "Turkish", {}, onRejected)).resolves.toBe("");
      expect(onRejected).toHaveBeenCalledWith("refusal");
    }
  });

  it("an error in a check call fails closed (returns '', verification_failed)", async () => {
    scripted(new Error("503 upstream"), '{ "same": true }');
    const onRejected = vi.fn();
    await expect(translateReason(EN, "Turkish", {}, onRejected)).resolves.toBe("");
    expect(onRejected).toHaveBeenCalledWith("verification_failed");
  });

  it("quota, key and rate-limit errors from a check call propagate to the caller's handler", async () => {
    scripted(
      new GeminiDailyQuotaError({ cls: "daily", retryAfterMs: null, message: "quota" } as never),
      '{ "same": true }'
    );
    await expect(translateReason(EN, "Turkish")).rejects.toBeInstanceOf(GeminiDailyQuotaError);
  });

  it("an abort during a check call propagates instead of counting as a failed check", async () => {
    const controller = new AbortController();
    mockCallAI.mockImplementation(async (prompt: string) => {
      if (prompt.startsWith("Render the following")) {
        controller.abort();
        throw Object.assign(new Error("aborted"), { name: "AbortError" });
      }
      return TR;
    });
    await expect(translateReason(EN, "Turkish", { signal: controller.signal })).rejects.toThrow(
      "aborted"
    );
  });

  it("does not run the check for a translation that already failed validation", async () => {
    mockCallAI.mockResolvedValue("I'm sorry, but I can't help with that.");
    await expect(translateReason(EN, "Turkish")).resolves.toBe("");
    expect(mockCallAI).toHaveBeenCalledTimes(1);
  });

  it("spends the batch budget and uses the pacer for each of the two check calls", async () => {
    scripted(BACK, '{ "same": true }');
    const spendBudget = vi.fn(() => true);
    const pacer = { waitTurn: vi.fn(async () => {}), noteRequest: vi.fn() };

    await translateReason(EN, "Turkish", {}, undefined, undefined, { spendBudget, pacer });

    expect(spendBudget).toHaveBeenCalledTimes(2);
    expect(pacer.waitTurn).toHaveBeenCalledTimes(2);
    // The translation itself is noted before the checks, plus one per check call.
    expect(pacer.noteRequest).toHaveBeenCalledTimes(3);
  });

  it("notes the translation request before the first check call is paced", async () => {
    scripted(BACK, '{ "same": true }');
    const order: string[] = [];
    const pacer = {
      waitTurn: vi.fn(async () => void order.push("wait")),
      noteRequest: vi.fn(() => void order.push("note")),
    };
    await translateReason(EN, "Turkish", {}, undefined, undefined, { pacer });
    expect(order).toEqual(["note", "wait", "note", "wait", "note"]);
  });

  it("throws TranslationBudgetExhaustedError, with no check call, when the budget is spent", async () => {
    scripted(BACK, '{ "same": true }');
    await expect(
      translateReason(EN, "Turkish", {}, undefined, undefined, { spendBudget: () => false })
    ).rejects.toBeInstanceOf(TranslationBudgetExhaustedError);
    // Only the translation call itself was made.
    expect(mockCallAI).toHaveBeenCalledTimes(1);
  });

  it("throws when the budget runs out between the two check calls, never returning the translation", async () => {
    scripted(BACK, '{ "same": true }');
    let spent = 0;
    await expect(
      translateReason(EN, "Turkish", {}, undefined, undefined, { spendBudget: () => ++spent <= 1 })
    ).rejects.toBeInstanceOf(TranslationBudgetExhaustedError);
    expect(mockCallAI).toHaveBeenCalledTimes(2);
  });
});
