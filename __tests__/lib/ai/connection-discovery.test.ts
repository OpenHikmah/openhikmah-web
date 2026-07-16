import { describe, it, expect, vi, beforeEach } from "vitest";

// ── DB mock: select() resolves to a configurable result via a chainable Proxy.
// Optionally records the arguments each chained method was called with, keyed
// by method name, so a test can assert *which* where-clause conditions were
// built (e.g. whether notInArray(excludeRefs) was included) without needing to
// fully emulate drizzle's SQL builder.
function makeSelectChain(resolveWith: unknown[], calls?: Record<string, unknown[][]>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = new Proxy(
    function () {
      return chain;
    },
    {
      get(_t, prop) {
        if (prop === "then")
          return (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
            Promise.resolve(resolveWith).then(res, rej);
        return (...args: unknown[]) => {
          if (calls) (calls[prop as string] ??= []).push(args);
          return chain;
        };
      },
      apply() {
        return chain;
      },
    }
  );
  return chain;
}

const { mockSelect, mockSemanticCandidates, mockAndCalls } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockSemanticCandidates: vi.fn(),
  mockAndCalls: [] as unknown[][],
}));

vi.mock("@/lib/infra/db", () => ({ db: { select: mockSelect, selectDistinct: mockSelect } }));
vi.mock("@/lib/quran/semantic-search", () => ({ semanticCandidates: mockSemanticCandidates }));
// Wrap the real `and` so tests can assert how many where-conditions
// rootCandidates() built — e.g. whether notInArray(excludeRefs) was included —
// without reimplementing drizzle's SQL builder.
vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    and: (...args: unknown[]) => {
      mockAndCalls.push(args);
      return actual.and(...(args as Parameters<typeof actual.and>));
    },
  };
});

import { discoverCandidates } from "@/lib/ai/connection-discovery";

describe("discoverCandidates", () => {
  beforeEach(() => {
    mockSelect.mockReset();
    mockSemanticCandidates.mockReset();
    mockAndCalls.length = 0;
  });

  it("returns [] for 'root' when the source verse has no roots seeded", async () => {
    mockSelect.mockReturnValueOnce(makeSelectChain([]));
    const out = await discoverCandidates("1:1", "root");
    expect(out).toEqual([]);
    expect(mockSemanticCandidates).not.toHaveBeenCalled();
  });

  it("returns ranked root candidates from the second query when roots exist", async () => {
    mockSelect
      .mockReturnValueOnce(makeSelectChain([{ root: "سمو" }, { root: "علم" }]))
      .mockReturnValueOnce(
        makeSelectChain([
          { ref: "2:255", shared: 2 },
          { ref: "3:18", shared: 1 },
        ])
      );
    const out = await discoverCandidates("1:1", "root", 12);
    expect(out).toEqual(["2:255", "3:18"]);
  });

  // Regression test for the fix in 2297aab (issue #185): repeat-clicking "root"
  // expansion must not keep returning the same already-seen refs, which
  // requires notInArray(excludeRefs) to actually be threaded into the second
  // query's where-clause whenever excludeRefs is non-empty.
  it("threads excludeRefs into the root candidate query's where-clause", async () => {
    const rankedCalls: Record<string, unknown[][]> = {};
    mockSelect
      .mockReturnValueOnce(makeSelectChain([{ root: "سمو" }]))
      .mockReturnValueOnce(makeSelectChain([{ ref: "3:18", shared: 1 }], rankedCalls));

    await discoverCandidates("1:1", "root", 12, ["2:255"]);

    // rootCandidates() builds its first `and(...)` (source-verse root lookup)
    // before the second query's own `and(...)` call — the second call is the
    // one whose condition count reflects whether excludeRefs was included.
    expect(mockAndCalls).toHaveLength(2);
    expect(mockAndCalls[1]).toHaveLength(3); // inArray + ne + notInArray(excludeRefs)
  });

  it("omits the notInArray condition entirely when excludeRefs is empty", async () => {
    mockSelect
      .mockReturnValueOnce(makeSelectChain([{ root: "سمو" }]))
      .mockReturnValueOnce(makeSelectChain([{ ref: "3:18", shared: 1 }]));

    await discoverCandidates("1:1", "root", 12, []);

    expect(mockAndCalls).toHaveLength(2);
    expect(mockAndCalls[1]).toHaveLength(2); // inArray + ne only, no notInArray
  });

  it("delegates 'thematic' to semanticCandidates without touching the db", async () => {
    mockSemanticCandidates.mockResolvedValue(["2:255"]);
    const out = await discoverCandidates("1:1", "thematic", 5, ["9:1"]);
    expect(mockSelect).not.toHaveBeenCalled();
    expect(mockSemanticCandidates).toHaveBeenCalledWith("1:1", 5, ["9:1"]);
    expect(out).toEqual(["2:255"]);
  });

  it("delegates 'contrast' to semanticCandidates as well", async () => {
    mockSemanticCandidates.mockResolvedValue(["3:18"]);
    const out = await discoverCandidates("1:1", "contrast");
    expect(mockSemanticCandidates).toHaveBeenCalledWith("1:1", 12, []);
    expect(out).toEqual(["3:18"]);
  });
});
