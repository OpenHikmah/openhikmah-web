import { describe, it, expect } from "vitest";
import { isValidNode } from "@/lib/canvas/share-canvas";

function nodeWith(verse: unknown) {
  return { verse };
}

describe("isValidNode", () => {
  it("accepts a node with all required verse string fields", () => {
    expect(
      isValidNode(
        nodeWith({ ref: "1:1", surahName: "Al-Fatihah", translation: "In the name of..." })
      )
    ).toBe(true);
  });

  it("rejects null", () => {
    expect(isValidNode(null)).toBe(false);
  });

  it("rejects non-object primitives", () => {
    expect(isValidNode("string")).toBe(false);
    expect(isValidNode(42)).toBe(false);
    expect(isValidNode(undefined)).toBe(false);
  });

  it("rejects a node missing verse entirely", () => {
    expect(isValidNode({})).toBe(false);
  });

  it("rejects a node whose verse is null", () => {
    expect(isValidNode(nodeWith(null))).toBe(false);
  });

  it("rejects a node whose verse is not an object", () => {
    expect(isValidNode(nodeWith("not an object"))).toBe(false);
  });

  it("rejects when ref is missing or the wrong type", () => {
    expect(isValidNode(nodeWith({ surahName: "x", translation: "y" }))).toBe(false);
    expect(isValidNode(nodeWith({ ref: 1, surahName: "x", translation: "y" }))).toBe(false);
  });

  it("rejects when surahName is missing or the wrong type", () => {
    expect(isValidNode(nodeWith({ ref: "1:1", translation: "y" }))).toBe(false);
    expect(isValidNode(nodeWith({ ref: "1:1", surahName: 1, translation: "y" }))).toBe(false);
  });

  it("rejects when translation is missing or the wrong type", () => {
    expect(isValidNode(nodeWith({ ref: "1:1", surahName: "x" }))).toBe(false);
    expect(isValidNode(nodeWith({ ref: "1:1", surahName: "x", translation: 1 }))).toBe(false);
  });

  it("ignores extra/unexpected fields and validates only ref/surahName/translation", () => {
    // A `__proto__` key from JSON.parse is just an own data property, not the
    // object's actual prototype — this asserts isValidNode doesn't get tripped
    // up by it either way, as long as the three required fields are present.
    const withExtraField = JSON.parse(
      '{"verse": {"ref": "1:1", "surahName": "x", "translation": "y", "__proto__": {"polluted": true}}}'
    );
    expect(isValidNode(withExtraField)).toBe(true);
    expect(Object.getPrototypeOf(withExtraField.verse)).toBe(Object.prototype);
  });
});
