import { describe, it, expect } from "vitest";
import { containsTashbih } from "@/lib/ai/theological-constraints";

describe("containsTashbih", () => {
  it("flags blunt anthropomorphic phrasing", () => {
    expect(containsTashbih("This verse shows God literally has a physical body.")).toBe(true);
    expect(containsTashbih("He sits upon the throne like a king.")).toBe(true);
  });

  it("passes a Tanzih-consistent reflection", () => {
    expect(
      containsTashbih(
        "The believer strives in lawful means while certain that provision belongs solely to Allah."
      )
    ).toBe(false);
  });

  it("is stateless across repeated calls", () => {
    const bad = "It has the appearance of a man.";
    expect(containsTashbih(bad)).toBe(true);
    expect(containsTashbih(bad)).toBe(true);
  });
});
