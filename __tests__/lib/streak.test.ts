import { describe, it, expect } from "vitest";
import { effectiveStreak, todayUTC, yesterdayUTC } from "@/lib/streak";

describe("effectiveStreak", () => {
  it("keeps the streak when last activity was today", () => {
    expect(effectiveStreak(7, todayUTC())).toBe(7);
  });

  it("keeps the streak when last activity was yesterday (still alive)", () => {
    expect(effectiveStreak(7, yesterdayUTC())).toBe(7);
  });

  it("decays to 0 when last activity was two or more days ago", () => {
    expect(effectiveStreak(30, "2000-01-01")).toBe(0);
  });

  it("is 0 when there is no recorded activity", () => {
    expect(effectiveStreak(5, null)).toBe(0);
  });
});
