import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetVerses, dbState } = vi.hoisted(() => ({
  mockGetVerses: vi.fn(async () => new Map()),
  dbState: { rows: [] as Array<{ ref: string; similarity: number }> },
}));

// Chainable + thenable DB proxy: nearest() does db.select().from().where().orderBy().limit().
function makeDbChain() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = new Proxy(
    function () {
      return chain;
    },
    {
      get(_t, prop) {
        if (prop === "then")
          return (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
            Promise.resolve(dbState.rows).then(res, rej);
        return () => chain;
      },
      apply() {
        return chain;
      },
    }
  );
  return chain;
}

vi.mock("@/lib/infra/db", () => ({ db: makeDbChain() }));
vi.mock("@/lib/ai/ai", () => ({ embed: vi.fn(async () => [0.1, 0.2, 0.3]) }));
vi.mock("@/lib/infra/redis", () => ({
  redisGet: vi.fn(async () => null),
  redisSet: vi.fn(async () => undefined),
}));
vi.mock("@/lib/quran/quran-corpus", () => ({ getVerses: mockGetVerses }));

import { searchByMeaning } from "@/lib/quran/semantic-search";

describe("searchByMeaning — edition passthrough", () => {
  beforeEach(() => {
    dbState.rows = [{ ref: "2:255", similarity: 0.9 }];
    mockGetVerses.mockReset().mockResolvedValue(new Map());
  });

  it("passes the requested edition through to getVerses (ranking stays English-keyed, display text follows edition)", async () => {
    await searchByMeaning("mercy", 10, "tr.diyanet");
    expect(mockGetVerses).toHaveBeenCalledWith(["2:255"], "tr.diyanet");
  });

  it("defaults to no edition (English) when the caller doesn't specify one", async () => {
    await searchByMeaning("mercy");
    expect(mockGetVerses).toHaveBeenCalledWith(["2:255"], undefined);
  });
});
