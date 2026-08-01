import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Chainable + thenable DB proxy (mirrors __tests__/lib/graph-service.test.ts) ──
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

const { mockSelect, mockInsert, mockValues, mockOnConflict, mockOnConflictDoNothing } = vi.hoisted(
  () => {
    const mockOnConflict = vi.fn().mockResolvedValue(undefined);
    // Default: the insert "wins" (no conflict) — `.returning()` yields a
    // non-empty array. Tests that simulate a losing conflict override this
    // to resolve `.returning()` to `[]`.
    const mockOnConflictDoNothing = vi.fn(() => ({
      returning: vi.fn().mockResolvedValue([{ reason: "unused" }]),
    }));
    const mockValues = vi.fn((..._args: unknown[]) => ({
      onConflictDoUpdate: mockOnConflict,
      onConflictDoNothing: mockOnConflictDoNothing,
    }));
    return {
      mockSelect: vi.fn(),
      mockInsert: vi.fn(() => ({ values: mockValues })),
      mockValues,
      mockOnConflict,
      mockOnConflictDoNothing,
    };
  }
);

vi.mock("@/lib/infra/db", () => ({ db: { select: mockSelect, insert: mockInsert } }));

import {
  getOrGenerateNameContent,
  getOrGenerateVerseReason,
  getCachedNameContent,
} from "@/lib/names/name-content";

const isEmptyArr = (v: unknown[]) => v.length === 0;

describe("getOrGenerateNameContent", () => {
  beforeEach(() => {
    mockSelect.mockReset();
    mockInsert.mockClear();
    mockValues.mockClear();
    mockOnConflict.mockClear();
    mockOnConflictDoNothing.mockClear();
  });

  it("returns the cached value on a hit WITHOUT generating", async () => {
    mockSelect.mockReturnValue(makeSelectChain([{ data: JSON.stringify(["cached"]), version: 1 }]));
    const generate = vi.fn();

    const out = await getOrGenerateNameContent("as-salam", "verses", "en", 1, generate, isEmptyArr);

    expect(out).toEqual(["cached"]);
    expect(generate).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("on a miss, generates once and persists (upsert)", async () => {
    mockSelect.mockReturnValue(makeSelectChain([])); // no row
    const generate = vi.fn().mockResolvedValue(["a", "b"]);

    const out = await getOrGenerateNameContent("al-malik", "verses", "en", 2, generate, isEmptyArr);

    expect(generate).toHaveBeenCalledTimes(1);
    expect(out).toEqual(["a", "b"]);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    const values = mockValues.mock.calls[0][0] as Record<string, unknown>;
    expect(values).toMatchObject({ slug: "al-malik", kind: "verses", locale: "en", version: 2 });
    expect(JSON.parse(values.data as string)).toEqual(["a", "b"]);
  });

  it("keys the cache by locale — a Turkish miss doesn't reuse or clobber the English row", async () => {
    mockSelect.mockReturnValue(makeSelectChain([])); // no row for this (slug, kind, locale)
    const generate = vi.fn().mockResolvedValue("bir yansıma");

    const out = await getOrGenerateNameContent(
      "ar-rahman",
      "reflection",
      "tr",
      1,
      generate,
      (s: string) => s.trim() === ""
    );

    expect(out).toBe("bir yansıma");
    const values = mockValues.mock.calls[0][0] as Record<string, unknown>;
    expect(values).toMatchObject({ slug: "ar-rahman", kind: "reflection", locale: "tr" });
    const target = mockOnConflict.mock.calls[0][0].target as unknown[];
    expect(target).toHaveLength(3); // [slug, kind, locale] — not the old 2-column PK
  });

  it("regenerates when the stored version is older than the current version", async () => {
    mockSelect.mockReturnValue(makeSelectChain([{ data: JSON.stringify(["old"]), version: 1 }]));
    const generate = vi.fn().mockResolvedValue(["new"]);

    const out = await getOrGenerateNameContent("al-malik", "verses", "en", 2, generate, isEmptyArr);

    expect(generate).toHaveBeenCalledTimes(1);
    expect(out).toEqual(["new"]);
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it("regenerates when the cached row is corrupt JSON", async () => {
    mockSelect.mockReturnValue(makeSelectChain([{ data: "{not json", version: 1 }]));
    const generate = vi.fn().mockResolvedValue(["recovered"]);

    const out = await getOrGenerateNameContent("al-malik", "verses", "en", 1, generate, isEmptyArr);

    expect(generate).toHaveBeenCalledTimes(1);
    expect(out).toEqual(["recovered"]);
  });

  it("does NOT persist an empty result (so a transient failure can retry)", async () => {
    mockSelect.mockReturnValue(makeSelectChain([]));
    const generate = vi.fn().mockResolvedValue([]);

    const out = await getOrGenerateNameContent("al-malik", "verses", "en", 1, generate, isEmptyArr);

    expect(out).toEqual([]);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("round-trips a string payload (reflection)", async () => {
    mockSelect.mockReturnValue(
      makeSelectChain([{ data: JSON.stringify("a reflection"), version: 1 }])
    );
    const generate = vi.fn();

    const out = await getOrGenerateNameContent(
      "ar-rahman",
      "reflection",
      "en",
      1,
      generate,
      (s: string) => s.trim() === ""
    );

    expect(out).toBe("a reflection");
    expect(generate).not.toHaveBeenCalled();
  });

  it("coalesces concurrent identical first-loads into ONE generation", async () => {
    mockSelect.mockReturnValue(makeSelectChain([])); // always a miss
    let release!: (v: string[]) => void;
    const generate = vi.fn(
      () =>
        new Promise<string[]>((res) => {
          release = res;
        })
    );

    const all = Promise.all([
      getOrGenerateNameContent("al-malik", "verses", "en", 1, generate, isEmptyArr),
      getOrGenerateNameContent("al-malik", "verses", "en", 1, generate, isEmptyArr),
      getOrGenerateNameContent("al-malik", "verses", "en", 1, generate, isEmptyArr),
    ]);

    await new Promise((r) => setTimeout(r, 0));
    expect(generate).toHaveBeenCalledTimes(1);

    release(["x"]);
    const [a, b, c] = await all;
    expect(a).toEqual(["x"]);
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it("calls onBeforeGenerate on a miss, before generate", async () => {
    mockSelect.mockReturnValue(makeSelectChain([])); // miss
    const order: string[] = [];
    const onBeforeGenerate = vi.fn(async () => {
      order.push("gate");
    });
    const generate = vi.fn(async () => {
      order.push("generate");
      return ["x"];
    });

    const out = await getOrGenerateNameContent(
      "al-malik",
      "verses",
      "en",
      1,
      generate,
      isEmptyArr,
      onBeforeGenerate
    );

    expect(out).toEqual(["x"]);
    expect(onBeforeGenerate).toHaveBeenCalledTimes(1);
    expect(order).toEqual(["gate", "generate"]);
  });

  it("does NOT call onBeforeGenerate on a cache hit", async () => {
    mockSelect.mockReturnValue(makeSelectChain([{ data: JSON.stringify(["cached"]), version: 1 }]));
    const onBeforeGenerate = vi.fn();
    const generate = vi.fn();

    const out = await getOrGenerateNameContent(
      "as-salam",
      "verses",
      "en",
      1,
      generate,
      isEmptyArr,
      onBeforeGenerate
    );

    expect(out).toEqual(["cached"]);
    expect(onBeforeGenerate).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });

  it("a throwing onBeforeGenerate propagates, skips generation, and caches nothing", async () => {
    mockSelect.mockReturnValue(makeSelectChain([])); // miss
    const onBeforeGenerate = vi.fn().mockRejectedValue(new Error("rate limited"));
    const generate = vi.fn();

    await expect(
      getOrGenerateNameContent(
        "al-malik",
        "verses",
        "en",
        1,
        generate,
        isEmptyArr,
        onBeforeGenerate
      )
    ).rejects.toThrow("rate limited");
    expect(generate).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();

    // A later allowed call still generates (no stuck lock).
    const out = await getOrGenerateNameContent(
      "al-malik",
      "verses",
      "en",
      1,
      vi.fn().mockResolvedValue(["ok"]),
      isEmptyArr
    );
    expect(out).toEqual(["ok"]);
  });

  it("surfaces a generate() rejection and clears the lock so the next call retries", async () => {
    mockSelect.mockReturnValue(makeSelectChain([])); // miss
    const generate = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValue(["ok"]);

    await expect(
      getOrGenerateNameContent("al-malik", "verses", "en", 1, generate, isEmptyArr)
    ).rejects.toThrow("boom");
    // lock released in finally → fresh call regenerates
    const out = await getOrGenerateNameContent("al-malik", "verses", "en", 1, generate, isEmptyArr);
    expect(out).toEqual(["ok"]);
    expect(generate).toHaveBeenCalledTimes(2);
  });
});

describe("getCachedNameContent", () => {
  beforeEach(() => {
    mockSelect.mockReset();
    mockInsert.mockClear();
  });

  it("returns the cached value on a hit at the current version", async () => {
    mockSelect.mockReturnValue(
      makeSelectChain([{ data: JSON.stringify("a reflection"), version: 1 }])
    );

    const out = await getCachedNameContent<string>("ar-rahman", "reflection", "en", 1);

    expect(out).toBe("a reflection");
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("returns null on a miss (no row)", async () => {
    mockSelect.mockReturnValue(makeSelectChain([]));

    const out = await getCachedNameContent<string>("ar-rahman", "reflection", "en", 1);

    expect(out).toBeNull();
  });

  it("returns null when the stored version is older than the requested version", async () => {
    mockSelect.mockReturnValue(makeSelectChain([{ data: JSON.stringify("stale"), version: 1 }]));

    const out = await getCachedNameContent<string>("ar-rahman", "reflection", "en", 2);

    expect(out).toBeNull();
  });

  it("returns null and logs on corrupt cached JSON, without persisting anything", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockSelect.mockReturnValue(makeSelectChain([{ data: "{not json", version: 1 }]));

    const out = await getCachedNameContent<string>("ar-rahman", "reflection", "en", 1);

    expect(out).toBeNull();
    expect(mockInsert).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("never calls generate — it is read-only", async () => {
    mockSelect.mockReturnValue(makeSelectChain([{ data: JSON.stringify(["a", "b"]), version: 1 }]));

    const out = await getCachedNameContent<string[]>("al-malik", "pairings", "en", 1);

    expect(out).toEqual(["a", "b"]);
  });
});

describe("getOrGenerateVerseReason", () => {
  beforeEach(() => {
    mockSelect.mockReset();
    mockInsert.mockClear();
    mockValues.mockClear();
    mockOnConflict.mockClear();
    mockOnConflictDoNothing.mockClear();
  });

  it("returns a cached translation without calling generate", async () => {
    mockSelect.mockReturnValue(makeSelectChain([{ reason: "zaten çevrilmiş" }]));
    const generate = vi.fn();

    const out = await getOrGenerateVerseReason("ar-rahman", "2:255", "tr", generate);

    expect(out).toBe("zaten çevrilmiş");
    expect(generate).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("on a miss, translates and persists (insert, not upsert)", async () => {
    mockSelect.mockReturnValue(makeSelectChain([])); // no row
    const generate = vi.fn().mockResolvedValue("çevrilmiş sebep");

    const out = await getOrGenerateVerseReason("ar-rahman", "2:255", "tr", generate);

    expect(out).toBe("çevrilmiş sebep");
    expect(generate).toHaveBeenCalledTimes(1);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    const values = mockValues.mock.calls[0][0] as Record<string, unknown>;
    expect(values).toMatchObject({
      slug: "ar-rahman",
      ref: "2:255",
      locale: "tr",
      reason: "çevrilmiş sebep",
    });
    expect(mockOnConflictDoNothing).toHaveBeenCalledTimes(1);
  });

  it("does not persist an empty translation", async () => {
    mockSelect.mockReturnValue(makeSelectChain([]));
    const generate = vi.fn().mockResolvedValue("");

    const out = await getOrGenerateVerseReason("ar-rahman", "2:255", "tr", generate);

    expect(out).toBe("");
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("when another process wins the insert race, returns the persisted (stored) translation, not the local one", async () => {
    // First select (cache check): miss. Second select (post-conflict re-read,
    // triggered by an empty .returning()): the other writer's stored value.
    mockSelect
      .mockReturnValueOnce(makeSelectChain([]))
      .mockReturnValueOnce(makeSelectChain([{ reason: "diğer işlemin çevirisi" }]));
    mockOnConflictDoNothing.mockReturnValueOnce({ returning: vi.fn().mockResolvedValue([]) });
    const generate = vi.fn().mockResolvedValue("bu işlemin çevirisi");

    const out = await getOrGenerateVerseReason("ar-rahman", "2:255", "tr", generate);

    expect(out).toBe("diğer işlemin çevirisi");
  });

  it("calls onBeforeGenerate on a miss, before generate", async () => {
    mockSelect.mockReturnValue(makeSelectChain([]));
    const order: string[] = [];
    const onBeforeGenerate = vi.fn(async () => {
      order.push("gate");
    });
    const generate = vi.fn(async () => {
      order.push("generate");
      return "çeviri";
    });

    await getOrGenerateVerseReason("ar-rahman", "2:255", "tr", generate, onBeforeGenerate);

    expect(onBeforeGenerate).toHaveBeenCalledTimes(1);
    expect(order).toEqual(["gate", "generate"]);
  });

  it("does NOT call onBeforeGenerate on a cache hit", async () => {
    mockSelect.mockReturnValue(makeSelectChain([{ reason: "cached" }]));
    const onBeforeGenerate = vi.fn();

    await getOrGenerateVerseReason("ar-rahman", "2:255", "tr", vi.fn(), onBeforeGenerate);

    expect(onBeforeGenerate).not.toHaveBeenCalled();
  });

  it("coalesces concurrent identical first-loads into ONE translation call", async () => {
    mockSelect.mockReturnValue(makeSelectChain([])); // always a miss
    let release!: (v: string) => void;
    const generate = vi.fn(
      () =>
        new Promise<string>((res) => {
          release = res;
        })
    );

    const all = Promise.all([
      getOrGenerateVerseReason("ar-rahman", "2:255", "tr", generate),
      getOrGenerateVerseReason("ar-rahman", "2:255", "tr", generate),
    ]);

    await new Promise((r) => setTimeout(r, 0));
    expect(generate).toHaveBeenCalledTimes(1);

    release("sonuç");
    const [a, b] = await all;
    expect(a).toBe("sonuç");
    expect(b).toBe("sonuç");
  });
});
