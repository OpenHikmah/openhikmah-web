import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockCallAI, mockIncr } = vi.hoisted(() => ({ mockCallAI: vi.fn(), mockIncr: vi.fn() }));
vi.mock("@/lib/ai/ai", () => ({ callAI: mockCallAI }));
vi.mock("@/lib/infra/metrics", () => ({ incr: mockIncr }));

import { verifyReflection, verifyPairings } from "@/lib/names/name-verify";
import { getNameBySlug } from "@/lib/names/divine-names";
import { TANZIH_CONSTRAINT } from "@/lib/ai/theological-constraints";

const name = getNameBySlug("ar-rahman")!;
const markRefusal = vi.fn();
const ctx = { provider: "claude" as const, model: "claude-opus-4-7", markRefusal };

const errSpy = () => vi.spyOn(console, "error").mockImplementation(() => {});

beforeEach(() => {
  mockCallAI.mockReset();
  mockIncr.mockReset();
  markRefusal.mockReset();
});

describe("verifyReflection", () => {
  it("approves only on an explicit valid:true, and asks with the pinned provider/model", async () => {
    mockCallAI.mockResolvedValue('{ "valid": true }');
    expect(await verifyReflection(name, "A reflection.", ctx)).toBe(true);
    const [prompt, opts] = mockCallAI.mock.calls[0];
    expect(opts).toEqual({ feature: "names", provider: "claude", model: "claude-opus-4-7" });
    expect(prompt).toContain(name.transliteration);
    expect(prompt).toContain(name.meaning);
    expect(prompt).toContain("A reflection.");
    expect(prompt).toContain(TANZIH_CONSTRAINT);
    expect(markRefusal).not.toHaveBeenCalled();
  });

  it.each([
    ["valid:false", '{ "valid": false }'],
    ["valid as a string", '{ "valid": "true" }'],
    ["a missing verdict", '{ "note": "ok" }'],
    ["an array instead of an object", '[{ "valid": true }]'],
    ["prose with no JSON", "Looks fine to me."],
    ["invalid JSON", "{ valid: true"],
  ])("does not approve %s", async (_label, reply) => {
    mockCallAI.mockResolvedValue(reply);
    const spy = errSpy();
    expect(await verifyReflection(name, "A reflection.", ctx)).toBe(false);
    expect(markRefusal).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("meters a plain rejection but does not mark it a refusal", async () => {
    mockCallAI.mockResolvedValue('{ "valid": false }');
    await verifyReflection(name, "A reflection.", ctx);
    expect(mockIncr).toHaveBeenCalledWith("names_rejected_verification");
    expect(markRefusal).not.toHaveBeenCalled();
  });

  it("fails closed on a call error and meters it", async () => {
    mockCallAI.mockRejectedValue(new Error("503"));
    const spy = errSpy();
    expect(await verifyReflection(name, "A reflection.", ctx)).toBe(false);
    expect(mockIncr).toHaveBeenCalledWith("names_verify_call_failed");
    spy.mockRestore();
  });

  it("marks a reviewer refusal so it is not silently answered by Gemini", async () => {
    mockCallAI.mockResolvedValue("I'm sorry, but I can't help with that.");
    const spy = errSpy();
    expect(await verifyReflection(name, "A reflection.", ctx)).toBe(false);
    expect(markRefusal).toHaveBeenCalledOnce();
    spy.mockRestore();
  });
});

describe("verifyPairings", () => {
  const pairings = [
    { name: "ar-rahim", explanation: "Balances mercy in general and specific senses." },
    { name: "al-malik", explanation: "Pairs mercy with sovereignty." },
    { name: "al-hayy", explanation: "Mercy sustained by the Ever-Living." },
  ];

  it("keeps only explicitly approved pairings, in their original order", async () => {
    mockCallAI.mockResolvedValue(
      JSON.stringify([
        { name: "al-hayy", valid: true },
        { name: "ar-rahim", valid: true },
        { name: "al-malik", valid: false },
      ])
    );
    const kept = await verifyPairings(name, pairings, ctx);
    expect(kept.map((p) => p.name)).toEqual(["ar-rahim", "al-hayy"]);
  });

  it("drops a pairing that is unmentioned or both approved and rejected", async () => {
    mockCallAI.mockResolvedValue(
      JSON.stringify([
        { name: "ar-rahim", valid: true },
        { name: "ar-rahim", valid: false },
        { name: "al-hayy", valid: true },
      ])
    );
    const kept = await verifyPairings(name, pairings, ctx);
    expect(kept.map((p) => p.name)).toEqual(["al-hayy"]);
  });

  it("ignores verdicts of the wrong shape or for slugs that were never proposed", async () => {
    mockCallAI.mockResolvedValue(
      JSON.stringify([{ name: "ar-rahim" }, "junk", null, { name: "ghost", valid: true }])
    );
    expect(await verifyPairings(name, pairings, ctx)).toEqual([]);
  });

  it.each([
    ["a call error", () => mockCallAI.mockRejectedValue(new Error("503"))],
    ["an unparseable reply", () => mockCallAI.mockResolvedValue("No JSON here.")],
    ["a non-array reply", () => mockCallAI.mockResolvedValue("[1,")],
  ])("returns [] on %s", async (_label, arrange) => {
    arrange();
    const spy = errSpy();
    expect(await verifyPairings(name, pairings, ctx)).toEqual([]);
    spy.mockRestore();
  });

  it("marks a refusal and returns []", async () => {
    mockCallAI.mockResolvedValue("I'm sorry, but I can't help with that.");
    const spy = errSpy();
    expect(await verifyPairings(name, pairings, ctx)).toEqual([]);
    expect(markRefusal).toHaveBeenCalledOnce();
    spy.mockRestore();
  });

  it("makes no call for an empty list", async () => {
    expect(await verifyPairings(name, [], ctx)).toEqual([]);
    expect(mockCallAI).not.toHaveBeenCalled();
  });
});
