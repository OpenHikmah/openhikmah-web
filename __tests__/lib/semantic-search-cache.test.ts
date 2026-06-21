import { describe, it, expect, vi, beforeEach } from "vitest";

// Chainable + thenable DB proxy: nearest() does db.select().from().where().orderBy().limit()
function makeDbChain(resolveWith: unknown[] = []) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = new Proxy(function () { return chain; }, {
    get(_t, prop) {
      if (prop === "then")
        return (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
          Promise.resolve(resolveWith).then(res, rej);
      return () => chain;
    },
    apply() { return chain; },
  });
  return chain;
}

const { mockEmbed, mockRedisGet, mockRedisSet, mockGetVerses } = vi.hoisted(() => ({
  mockEmbed: vi.fn(),
  mockRedisGet: vi.fn(),
  mockRedisSet: vi.fn().mockResolvedValue(undefined),
  mockGetVerses: vi.fn(async () => new Map()),
}));

vi.mock("@/lib/db", () => ({ db: makeDbChain([]) }));
vi.mock("@/lib/ai", () => ({ embed: mockEmbed }));
vi.mock("@/lib/redis", () => ({ redisGet: mockRedisGet, redisSet: mockRedisSet }));
vi.mock("@/lib/quran-corpus", () => ({ getVerses: mockGetVerses }));

import { searchByMeaning } from "@/lib/semantic-search";

describe("searchByMeaning — query embedding cache", () => {
  beforeEach(() => {
    mockEmbed.mockReset().mockResolvedValue([0.1, 0.2, 0.3]);
    mockRedisGet.mockReset();
    mockRedisSet.mockClear();
    mockGetVerses.mockReset().mockResolvedValue(new Map());
  });

  it("uses the cached vector and does NOT call embed on a hit", async () => {
    mockRedisGet.mockResolvedValue(JSON.stringify([0.9, 0.8, 0.7]));
    await searchByMeaning("the light");
    expect(mockEmbed).not.toHaveBeenCalled();
  });

  it("embeds and writes the cache on a miss", async () => {
    mockRedisGet.mockResolvedValue(null);
    await searchByMeaning("the light");
    expect(mockEmbed).toHaveBeenCalledTimes(1);
    expect(mockRedisSet).toHaveBeenCalledTimes(1);
  });

  it("falls through to embed when the cached value is corrupt JSON", async () => {
    mockRedisGet.mockResolvedValue("{not json");
    await searchByMeaning("the light");
    expect(mockEmbed).toHaveBeenCalledTimes(1);
  });

  it("falls through to embed when the cached value is an empty array", async () => {
    mockRedisGet.mockResolvedValue(JSON.stringify([]));
    await searchByMeaning("the light");
    expect(mockEmbed).toHaveBeenCalledTimes(1);
  });
});
