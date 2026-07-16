import { describe, it, expect, vi, beforeEach } from "vitest";

// ── DB mock: select() resolves to a configurable result via a chainable Proxy ──
function makeSelectChain(resolveWith: unknown[]) {
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
        return () => chain;
      },
      apply() {
        return chain;
      },
    }
  );
  return chain;
}

const { mockSelect, mockSemanticCandidates } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockSemanticCandidates: vi.fn(),
}));

vi.mock("@/lib/infra/db", () => ({ db: { select: mockSelect, selectDistinct: mockSelect } }));
vi.mock("@/lib/quran/semantic-search", () => ({ semanticCandidates: mockSemanticCandidates }));

import { discoverCandidates } from "@/lib/ai/connection-discovery";

describe("discoverCandidates", () => {
  beforeEach(() => {
    mockSelect.mockReset();
    mockSemanticCandidates.mockReset();
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
