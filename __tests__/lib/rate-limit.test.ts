import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockReturning, mockOnConflict, mockValues, mockInsert } = vi.hoisted(() => {
  const mockReturning = vi.fn();
  const mockOnConflict = vi.fn(() => ({ returning: mockReturning }));
  const mockValues = vi.fn((..._args: unknown[]) => ({ onConflictDoUpdate: mockOnConflict }));
  const mockInsert = vi.fn(() => ({ values: mockValues }));
  return { mockReturning, mockOnConflict, mockValues, mockInsert };
});

vi.mock("@/lib/db", () => ({ db: { insert: mockInsert } }));

import { consume, RateLimitError } from "@/lib/rate-limit";

describe("rate-limit consume", () => {
  beforeEach(() => {
    mockReturning.mockReset();
    mockInsert.mockClear();
    mockValues.mockClear();
  });

  it("allows when count is within the limit", async () => {
    mockReturning.mockResolvedValue([{ count: 3 }]);
    expect(await consume("ip:1", 20, 60)).toBe(true);
  });

  it("blocks when count exceeds the limit", async () => {
    mockReturning.mockResolvedValue([{ count: 21 }]);
    expect(await consume("ip:1", 20, 60)).toBe(false);
  });

  it("allows exactly at the limit boundary", async () => {
    mockReturning.mockResolvedValue([{ count: 20 }]);
    expect(await consume("ip:1", 20, 60)).toBe(true);
  });

  it("fails open if the DB errors", async () => {
    mockReturning.mockRejectedValue(new Error("db down"));
    expect(await consume("ip:1", 20, 60)).toBe(true);
  });

  it("buckets keys by time window so each window starts fresh", async () => {
    mockReturning.mockResolvedValue([{ count: 1 }]);
    await consume("ip:1", 20, 60);
    const key = mockValues.mock.calls[0][0] as { key: string };
    expect(key.key).toMatch(/^ip:1:\d+$/);
  });

  it("RateLimitError carries a name", () => {
    expect(new RateLimitError().name).toBe("RateLimitError");
  });
});
