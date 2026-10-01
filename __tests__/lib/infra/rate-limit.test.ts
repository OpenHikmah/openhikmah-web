import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  mockReturning,
  mockValues,
  mockInsert,
  mockDeleteWhere,
  mockDelete,
  mockRedisIncr,
  mockIncr,
  mockGetFlagNumber,
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
  const mockGetFlagNumber = vi.fn(async (_key: string, fallback: number) => fallback);
  return {
    mockReturning,
    mockValues,
    mockInsert,
    mockDeleteWhere,
    mockDelete,
    mockRedisIncr,
    mockIncr,
    mockGetFlagNumber,
  };
});

vi.mock("@/lib/infra/db", () => ({ db: { insert: mockInsert, delete: mockDelete } }));
vi.mock("@/lib/infra/redis", () => ({ redisIncrWithTtl: mockRedisIncr }));
vi.mock("@/lib/infra/metrics", () => ({ incr: mockIncr }));
vi.mock("@/lib/admin/feature-flags", () => ({ getFlagNumber: mockGetFlagNumber }));

import { PgDialect } from "drizzle-orm/pg-core";
import {
  consume,
  expiredBucketsCondition,
  rateLimitOrNull,
  sweepRateLimits,
  RateLimitError,
  positiveIntEnv,
  AI_GEN_LIMIT,
  AI_GEN_WINDOW_SECONDS,
  MUTATION_LIMIT,
  MUTATION_WINDOW_SECONDS,
} from "@/lib/infra/rate-limit";

describe("rate-limit consume", () => {
  beforeEach(() => {
    mockReturning.mockReset();
    mockInsert.mockClear();
    mockValues.mockClear();
    mockRedisIncr.mockReset();
    mockRedisIncr.mockResolvedValue(null); // default: Postgres fallback path
    mockIncr.mockClear();
    mockGetFlagNumber.mockReset();
    mockGetFlagNumber.mockImplementation(async (_key: string, fallback: number) => fallback);
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
    expect(key.key).toMatch(/^ip:1:w60:\d+$/);
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

  // ─── Flag-aware defaults (new) ───────────────────────────────────────────────

  it("resolves limit/window from the ai_gen_* flags when omitted", async () => {
    mockGetFlagNumber.mockImplementation(async (key: string) => (key === "ai_gen_limit" ? 5 : 30));
    mockRedisIncr.mockResolvedValue(6); // over the flagged limit of 5
    expect(await consume("ip:1")).toBe(false);
    expect(mockGetFlagNumber).toHaveBeenCalledWith("ai_gen_limit", AI_GEN_LIMIT);
    expect(mockGetFlagNumber).toHaveBeenCalledWith("ai_gen_window_seconds", AI_GEN_WINDOW_SECONDS);
  });

  it("does not consult flags when limit/window are passed explicitly", async () => {
    mockRedisIncr.mockResolvedValue(1);
    await consume("ip:1", 20, 60);
    expect(mockGetFlagNumber).not.toHaveBeenCalled();
  });
});

describe("rateLimitOrNull", () => {
  beforeEach(() => {
    mockReturning.mockReset();
    mockRedisIncr.mockReset();
    mockGetFlagNumber.mockReset();
    mockGetFlagNumber.mockImplementation(async (_key: string, fallback: number) => fallback);
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

  it("resolves limit/window from the mutation_* flags when omitted", async () => {
    mockGetFlagNumber.mockImplementation(async (key: string) =>
      key === "mutation_limit" ? 2 : 600
    );
    mockRedisIncr.mockResolvedValue(3); // over the flagged limit of 2
    const res = await rateLimitOrNull("ip:1", "Too many");
    expect(res).not.toBeNull();
    expect(res!.status).toBe(429);
    expect(mockGetFlagNumber).toHaveBeenCalledWith("mutation_limit", MUTATION_LIMIT);
    expect(mockGetFlagNumber).toHaveBeenCalledWith(
      "mutation_window_seconds",
      MUTATION_WINDOW_SECONDS
    );
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

describe("expiredBucketsCondition", () => {
  const now = new Date("2026-06-10T12:00:00Z");
  const render = (windowSeconds: number) =>
    new PgDialect().sqlToQuery(expiredBucketsCondition(windowSeconds, now));

  it("judges only rows keyed with the caller's own window against that window's retention", () => {
    const { params } = render(600);
    expect(params).toContain(":w600:[0-9]+$");
    // 10 retained windows of 600s = 6000s before now.
    expect(params).toContainEqual(new Date(now.getTime() - 6000 * 1000).toISOString());
  });

  it("matches only the trailing window suffix, not a lookalike segment inside the caller's key", () => {
    const { sql: text, params } = render(600);
    expect(text).toMatch(/ ~ /);
    const re = new RegExp(params.find((p) => String(p).startsWith(":w600:")) as string);
    // `scope:w600:item` consume()d with a 20h window is stored as ...:w72000:<bucket>
    expect(re.test("scope:w600:item:w72000:5")).toBe(false);
    expect(re.test("scope:w600:item:w600:5")).toBe(true);
    expect(re.test("ip:1:w600:29847133")).toBe(true);
  });

  it("a short-window sweep does not match the 20h tz-anchor bucket", () => {
    const { params } = render(600);
    expect(params).not.toContain(":w72000:[0-9]+$");
    expect(params).toContain(":w600:[0-9]+$");
  });

  it("prunes legacy keys (no window segment) only after a day", () => {
    const { params } = render(600);
    expect(params).toContain(":w[0-9]+:[0-9]+$");
    expect(params).toContainEqual(new Date(now.getTime() - 24 * 3600 * 1000).toISOString());
  });
});

describe("consume row keys", () => {
  it("embeds the window in the postgres bucket key so sweeps can tell windows apart", async () => {
    mockRedisIncr.mockResolvedValue(null);
    mockReturning.mockResolvedValue([{ count: 1 }]);
    mockValues.mockClear();
    await consume("tz-anchor:7", 2, 72000);
    const row = mockValues.mock.calls[0][0] as { key: string };
    expect(row.key).toMatch(/^tz-anchor:7:w72000:\d+$/);
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
