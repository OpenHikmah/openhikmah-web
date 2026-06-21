import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Chainable + thenable DB proxy (mirrors __tests__/lib/graph-service.test.ts) ──
function makeSelectChain(resolveWith: unknown[]) {
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

const { mockSelect, mockInsert, mockValues, mockOnConflict } = vi.hoisted(() => {
  const mockOnConflict = vi.fn().mockResolvedValue(undefined);
  const mockValues = vi.fn((..._args: unknown[]) => ({ onConflictDoUpdate: mockOnConflict }));
  return {
    mockSelect: vi.fn(),
    mockInsert: vi.fn(() => ({ values: mockValues })),
    mockValues,
    mockOnConflict,
  };
});

vi.mock("@/lib/db", () => ({ db: { select: mockSelect, insert: mockInsert } }));

import { getOrGenerateNameContent } from "@/lib/name-content";

const isEmptyArr = (v: unknown[]) => v.length === 0;

describe("getOrGenerateNameContent", () => {
  beforeEach(() => {
    mockSelect.mockReset();
    mockInsert.mockClear();
    mockValues.mockClear();
    mockOnConflict.mockClear();
  });

  it("returns the cached value on a hit WITHOUT generating", async () => {
    mockSelect.mockReturnValue(
      makeSelectChain([{ data: JSON.stringify(["cached"]), version: 1 }])
    );
    const generate = vi.fn();

    const out = await getOrGenerateNameContent("as-salam", "verses", 1, generate, isEmptyArr);

    expect(out).toEqual(["cached"]);
    expect(generate).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("on a miss, generates once and persists (upsert)", async () => {
    mockSelect.mockReturnValue(makeSelectChain([])); // no row
    const generate = vi.fn().mockResolvedValue(["a", "b"]);

    const out = await getOrGenerateNameContent("al-malik", "verses", 2, generate, isEmptyArr);

    expect(generate).toHaveBeenCalledTimes(1);
    expect(out).toEqual(["a", "b"]);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    const values = mockValues.mock.calls[0][0] as Record<string, unknown>;
    expect(values).toMatchObject({ slug: "al-malik", kind: "verses", version: 2 });
    expect(JSON.parse(values.data as string)).toEqual(["a", "b"]);
  });

  it("regenerates when the stored version is older than the current version", async () => {
    mockSelect.mockReturnValue(
      makeSelectChain([{ data: JSON.stringify(["old"]), version: 1 }])
    );
    const generate = vi.fn().mockResolvedValue(["new"]);

    const out = await getOrGenerateNameContent("al-malik", "verses", 2, generate, isEmptyArr);

    expect(generate).toHaveBeenCalledTimes(1);
    expect(out).toEqual(["new"]);
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it("regenerates when the cached row is corrupt JSON", async () => {
    mockSelect.mockReturnValue(makeSelectChain([{ data: "{not json", version: 1 }]));
    const generate = vi.fn().mockResolvedValue(["recovered"]);

    const out = await getOrGenerateNameContent("al-malik", "verses", 1, generate, isEmptyArr);

    expect(generate).toHaveBeenCalledTimes(1);
    expect(out).toEqual(["recovered"]);
  });

  it("does NOT persist an empty result (so a transient failure can retry)", async () => {
    mockSelect.mockReturnValue(makeSelectChain([]));
    const generate = vi.fn().mockResolvedValue([]);

    const out = await getOrGenerateNameContent("al-malik", "verses", 1, generate, isEmptyArr);

    expect(out).toEqual([]);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("round-trips a string payload (reflection)", async () => {
    mockSelect.mockReturnValue(makeSelectChain([{ data: JSON.stringify("a reflection"), version: 1 }]));
    const generate = vi.fn();

    const out = await getOrGenerateNameContent(
      "ar-rahman", "reflection", 1, generate, (s: string) => s.trim() === ""
    );

    expect(out).toBe("a reflection");
    expect(generate).not.toHaveBeenCalled();
  });

  it("coalesces concurrent identical first-loads into ONE generation", async () => {
    mockSelect.mockReturnValue(makeSelectChain([])); // always a miss
    let release!: (v: string[]) => void;
    const generate = vi.fn(() => new Promise<string[]>((res) => { release = res; }));

    const all = Promise.all([
      getOrGenerateNameContent("al-malik", "verses", 1, generate, isEmptyArr),
      getOrGenerateNameContent("al-malik", "verses", 1, generate, isEmptyArr),
      getOrGenerateNameContent("al-malik", "verses", 1, generate, isEmptyArr),
    ]);

    await new Promise((r) => setTimeout(r, 0));
    expect(generate).toHaveBeenCalledTimes(1);

    release(["x"]);
    const [a, b, c] = await all;
    expect(a).toEqual(["x"]);
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it("surfaces a generate() rejection and clears the lock so the next call retries", async () => {
    mockSelect.mockReturnValue(makeSelectChain([])); // miss
    const generate = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue(["ok"]);

    await expect(
      getOrGenerateNameContent("al-malik", "verses", 1, generate, isEmptyArr)
    ).rejects.toThrow("boom");
    // lock released in finally → fresh call regenerates
    const out = await getOrGenerateNameContent("al-malik", "verses", 1, generate, isEmptyArr);
    expect(out).toEqual(["ok"]);
    expect(generate).toHaveBeenCalledTimes(2);
  });
});
