import { describe, it, expect, afterEach, vi } from "vitest";
import { resolveActivityDate } from "@/lib/social/activity-date";

describe("resolveActivityDate", () => {
  afterEach(() => vi.useRealTimers());

  function freeze(iso: string) {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(iso));
  }

  it("with an offset, credits the day the offset yields right now", () => {
    freeze("2026-08-28T22:30:00Z");
    // UTC+3 → local day is already the 29th.
    expect(resolveActivityDate("2026-08-29", 180)).toBe("2026-08-29");
  });

  it("with an offset, ignores a mismatched client local_date (can't pre-credit another day)", () => {
    freeze("2026-08-28T12:00:00Z");
    expect(resolveActivityDate("2026-09-15", 180)).toBe("2026-08-28");
  });

  it("with NO offset, buckets by UTC even when the client sends tomorrow (streak-inflation guard)", () => {
    freeze("2026-08-28T12:00:00Z");
    expect(resolveActivityDate("2026-08-29", null)).toBe("2026-08-28");
  });

  it("with NO offset, buckets by UTC even when the client sends today's local_date", () => {
    freeze("2026-08-28T12:00:00Z");
    expect(resolveActivityDate("2026-08-28", null)).toBe("2026-08-28");
  });

  it("falls back to UTC for a missing or malformed local_date", () => {
    freeze("2026-08-28T12:00:00Z");
    expect(resolveActivityDate(undefined, 180)).toBe("2026-08-28");
    expect(resolveActivityDate("not-a-date", 180)).toBe("2026-08-28");
    expect(resolveActivityDate("2026-02-30", 180)).toBe("2026-08-28");
  });
});
