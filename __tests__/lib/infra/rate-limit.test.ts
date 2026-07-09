import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  mockReturning,
  mockValues,
  mockInsert,
  mockDeleteWhere,
  mockDelete,
  mockRedisIncr,
  mockIncr,
} = vi.hoisted(() => {
  const mockReturning = vi.fn();
  const mockOnConflict = vi.fn(() => ({ returning: mockReturning }));
  const mockValues = vi.fn((..._args: unknown[]) => ({ onConflictDoUpdate: mockOnConflict }));
  const mockInsert = vi.fn(() => ({ values: mockValues }));
  const mockDeleteWhere = vi.fn().mockResolvedValue(undefined);
  const mockDelete = vi.fn(() => ({ where: mockDeleteWhere }));
  // Default: Redis unavailable (returns null) → existing tests exercise the
  // Postgres fallback path unchanged.
  const mockRedisIncr = vi.fn().mockResolvedValue(null);
  const mockIncr = vi.fn();
  return {
    mockReturning,
    mockValues,
    mockInsert,
    mockDeleteWhere,
    mockDelete,
    mockRedisIncr,
    mockIncr,
  };
});

vi.mock("@/lib/infra/db", () => ({ db: { insert: mockInsert, delete: mockDelete } }));
vi.mock("@/lib/infra/redis", () => ({ redisIncrWithTtl: mockRedisIncr }));
vi.mock("@/lib/infra/metrics", () => ({ incr: mockIncr }));

import {
  consume,
  rateLimitOrNull,
  sweepRateLimits,
  RateLimitError,
  positiveIntEnv,
} from "@/lib/infra/rate-limit";

describe("rate-limit consume", () => {
  beforeEach(() => {
    mockReturning.mockReset();
    mockInsert.mockClear();
    mockValues.mockClear();
    mockRedisIncr.mockReset();
    mockRedisIncr.mockResolvedValue(null); // default: Postgres fallback path
    mockIncr.mockClear();
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

  // ─── Redis-primary path (new) ───────────────────────────────────────────────

  it("uses Redis when available: under the limit allows, without touching Postgres", async () => {
    mockRedisIncr.mockResolvedValue(5);
    expect(await consume("ip:1", 20, 60)).toBe(true);
    expect(mockInsert).not.toHaveBeenCalled(); // Redis short-circuits the DB
  });

  it("Redis path allows exactly at the limit boundary (parity with Postgres)", async () => {
    mockRedisIncr.mockResolvedValue(20);
    expect(await consume("ip:1", 20, 60)).toBe(true);
  });

  it("Redis path blocks over the limit", async () => {
    mockRedisIncr.mockResolvedValue(21);
    expect(await consume("ip:1", 20, 60)).toBe(false);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("falls through to Postgres when Redis returns null", async () => {
    mockRedisIncr.mockResolvedValue(null);
    mockReturning.mockResolvedValue([{ count: 3 }]);
    expect(await consume("ip:1", 20, 60)).toBe(true);
    expect(mockInsert).toHaveBeenCalledOnce();
  });

  it("records a metric when Redis is down so the fallback is observable", async () => {
    mockRedisIncr.mockResolvedValue(null); // Redis unavailable
    mockReturning.mockResolvedValue([{ count: 3 }]);
    await consume("ip:1", 20, 60);
    expect(mockIncr).toHaveBeenCalledWith("ratelimit_redis_fallback");
    expect(mockIncr).toHaveBeenCalledWith("ratelimit_allow");
  });
});

describe("rateLimitOrNull", () => {
  beforeEach(() => {
    mockReturning.mockReset();
    mockRedisIncr.mockReset();
  });

  it("returns null (allowed) when under the limit", async () => {
    mockRedisIncr.mockResolvedValue(5);
    expect(await rateLimitOrNull("ip:1", "Too many", 20, 60)).toBeNull();
  });

  it("returns a 429 NextResponse with the given message when over the limit", async () => {
    mockRedisIncr.mockResolvedValue(21);
    const res = await rateLimitOrNull("ip:1", "Too many widgets", 20, 60);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(429);
    const body = await res!.json();
    expect(body.error).toBe("Too many widgets");
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
