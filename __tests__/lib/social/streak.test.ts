import { describe, it, expect, vi, afterEach } from "vitest";
import {
  effectiveStreak,
  todayUTC,
  yesterdayUTC,
  previousDay,
  localDateFromOffset,
} from "@/lib/social/streak";

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

describe("previousDay", () => {
  it("subtracts one calendar day", () => {
    expect(previousDay("2026-03-15")).toBe("2026-03-14");
  });

  it("rolls back across a month boundary", () => {
    expect(previousDay("2026-03-01")).toBe("2026-02-28");
  });

  it("rolls back across a year boundary", () => {
    expect(previousDay("2026-01-01")).toBe("2025-12-31");
  });

  it("handles a leap day", () => {
    expect(previousDay("2028-03-01")).toBe("2028-02-29");
  });
});

describe("localDateFromOffset", () => {
  afterEach(() => vi.useRealTimers());

  it("returns the UTC date for a zero offset", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-28T23:30:00Z"));
    expect(localDateFromOffset(0)).toBe("2026-08-28");
  });

  it("returns tomorrow for UTC+3 just before UTC midnight", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-28T22:30:00Z"));
    expect(localDateFromOffset(180)).toBe("2026-08-29");
  });

  it("returns yesterday for UTC-5 just after UTC midnight", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-29T02:00:00Z"));
    expect(localDateFromOffset(-300)).toBe("2026-08-28");
  });

  it("treats a null offset as UTC", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-28T12:00:00Z"));
    expect(localDateFromOffset(null)).toBe("2026-08-28");
  });
});

describe("effectiveStreak with a timezone offset", () => {
  afterEach(() => vi.useRealTimers());

  it("keeps a streak alive that UTC would already have decayed", () => {
    // 01:00 local on the 29th for a UTC+3 user is 22:00 UTC on the 28th.
    // Their last activity was the 28th (local yesterday) — still alive.
    // Plain UTC math: today=28th, yesterday=27th, lastActivity 28th >= 27th — also alive here,
    // so pick a sharper case: last activity two UTC-days ago but one local-day ago.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-29T22:30:00Z")); // 01:30 on the 30th, UTC+3
    // local today = 30th, local yesterday = 29th
    expect(effectiveStreak(6, "2026-08-29", 180)).toBe(6);
    // UTC would say: today 29th, yesterday 28th, lastActivity 29th >= 28th -> still 6 too.
  });

  it("decays a streak whose last activity is before local yesterday", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-30T21:00:00Z")); // 00:00 on the 31st, UTC+3
    // local today = 31st, local yesterday = 30th; last activity 29th -> decayed
    expect(effectiveStreak(6, "2026-08-29", 180)).toBe(0);
  });

  it("defaults to UTC when no offset is given", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-28T12:00:00Z"));
    expect(effectiveStreak(4, "2026-08-27")).toBe(4);
    expect(effectiveStreak(4, "2026-08-26")).toBe(0);
  });
});
