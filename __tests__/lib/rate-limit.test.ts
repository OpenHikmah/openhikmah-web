import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockReturning, mockValues, mockInsert, mockDeleteWhere, mockDelete } = vi.hoisted(() => {
  const mockReturning = vi.fn();
  const mockOnConflict = vi.fn(() => ({ returning: mockReturning }));
  const mockValues = vi.fn((..._args: unknown[]) => ({ onConflictDoUpdate: mockOnConflict }));
  const mockInsert = vi.fn(() => ({ values: mockValues }));
  const mockDeleteWhere = vi.fn().mockResolvedValue(undefined);
  const mockDelete = vi.fn(() => ({ where: mockDeleteWhere }));
  return { mockReturning, mockValues, mockInsert, mockDeleteWhere, mockDelete };
});

vi.mock("@/lib/db", () => ({ db: { insert: mockInsert, delete: mockDelete } }));

import { consume, sweepRateLimits, RateLimitError, positiveIntEnv } from "@/lib/rate-limit";

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

describe("sweepRateLimits", () => {
  beforeEach(() => {
    mockDelete.mockClear();
    mockDeleteWhere.mockClear();
  });

  it("issues a delete of expired buckets", async () => {
    await sweepRateLimits(600);
    expect(mockDelete).toHaveBeenCalledOnce();
    expect(mockDeleteWhere).toHaveBeenCalledOnce();
  });
});

describe("positiveIntEnv", () => {
  const KEY = "TEST_RL_ENV";
  afterEach(() => {
    delete process.env[KEY];
  });

  it("uses the fallback when unset or empty", () => {
    expect(positiveIntEnv(KEY, 60)).toBe(60);
    process.env[KEY] = "   ";
    expect(positiveIntEnv(KEY, 60)).toBe(60);
  });

  it("parses a valid positive integer", () => {
    process.env[KEY] = "30";
    expect(positiveIntEnv(KEY, 60)).toBe(30);
  });

  it("falls back for non-numeric, zero, negative, fractional, and Infinity", () => {
    for (const bad of ["abc", "0", "-5", "2.5", "Infinity", "NaN"]) {
      process.env[KEY] = bad;
      expect(positiveIntEnv(KEY, 60)).toBe(60);
    }
  });
});
