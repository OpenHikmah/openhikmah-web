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

const {
  mockSelect,
  mockInsert,
  mockValues,
  mockOnConflict,
  mockOnConflictDoNothing,
  mockUpdateSet,
} = vi.hoisted(() => {
  const mockOnConflict = vi.fn().mockResolvedValue(undefined);
  const mockUpdateSet = vi.fn(() => ({
    where: vi.fn().mockResolvedValue(undefined),
  }));
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
    mockUpdateSet,
  };
});

vi.mock("@/lib/infra/db", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
    update: vi.fn(() => ({ set: mockUpdateSet })),
  },
}));

import {
  getOrGenerateNameContent,
  getOrGenerateVerseReason,
  getCachedNameContent,
  getCachedNameContentBulk,
} from "@/lib/names/name-content";

const isEmptyArr = (v: unknown[]) => v.length === 0;

describe("getOrGenerateNameContent", () => {
  beforeEach(() => {
    mockSelect.mockReset();
    mockInsert.mockClear();
    mockValues.mockClear();
    mockOnConflict.mockClear();
    mockOnConflictDoNothing.mockClear();
    mockUpdateSet.mockClear();
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
    // The provider+model pair handed to generate() is the one that gets
    // persisted — resolved once, so a config change mid-flight can't split them.
    const passedToGenerate = generate.mock.calls[0][0] as { provider: string; model: string };
    expect(passedToGenerate).toEqual(
      expect.objectContaining({ provider: expect.any(String), model: expect.any(String) })
    );
    expect(values.model).toBe(passedToGenerate.model);
  });

  it("pins the provider+model resolved once, even if config flips during generation", async () => {
    mockSelect.mockReturnValue(makeSelectChain([])); // miss
    const ai = await import("@/lib/ai/ai");
    const providerSpy = vi.spyOn(ai, "resolveProvider").mockResolvedValue("gemini");
    const modelSpy = vi.spyOn(ai, "resolveModel").mockResolvedValue("gemini-3.7-flash");

    const generate = vi.fn(async (resolved: { provider: string; model: string }) => {
      // Admin flips the route back to Claude mid-generation.
      providerSpy.mockResolvedValue("claude");
      modelSpy.mockResolvedValue("claude-opus-5");
      return [resolved.provider, resolved.model];
    });

    const out = await getOrGenerateNameContent("al-malik", "verses", "en", 9, generate, isEmptyArr);

    expect(out).toEqual(["gemini", "gemini-3.7-flash"]);
    const values = mockValues.mock.calls[0][0] as Record<string, unknown>;
    expect(values.model).toBe("gemini-3.7-flash");
    expect(generate.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        provider: "gemini",
        model: "gemini-3.7-flash",
      })
    );
    providerSpy.mockRestore();
    modelSpy.mockRestore();
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
    // Test env defaults to Claude (see vitest setup), so an empty result
    // triggers one Gemini-fallback retry — also empty here, so still nothing
    // to persist.
    expect(generate).toHaveBeenCalledTimes(2);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("falls back to Gemini once when the primary (Claude) result is empty, and persists the Gemini result", async () => {
    mockSelect.mockReturnValue(makeSelectChain([])); // miss
    const ai = await import("@/lib/ai/ai");
    const providerSpy = vi.spyOn(ai, "resolveProvider").mockResolvedValue("claude");
    const modelSpy = vi
      .spyOn(ai, "resolveModel")
      .mockImplementation(async (_feature, provider) =>
        provider === "claude" ? "claude-opus-5" : "gemini-3.7-flash"
      );

    const generate = vi.fn(async (resolved: { provider: string; model: string }) =>
      resolved.provider === "claude" ? [] : ["a", "b"]
    );

    const out = await getOrGenerateNameContent("al-malik", "verses", "en", 1, generate, isEmptyArr);

    expect(out).toEqual(["a", "b"]);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[0][0]).toEqual(
      expect.objectContaining({ provider: "claude", model: "claude-opus-5" })
    );
    expect(generate.mock.calls[1][0]).toEqual(
      expect.objectContaining({ provider: "gemini", model: "gemini-3.7-flash" })
    );
    expect(mockInsert).toHaveBeenCalledTimes(1);
    const values = mockValues.mock.calls[0][0] as Record<string, unknown>;
    expect(values.model).toBe("gemini-3.7-flash");
    providerSpy.mockRestore();
    modelSpy.mockRestore();
  });

  it("logs when falling back to Gemini on an empty (non-thrown) primary result", async () => {
    mockSelect.mockReturnValue(makeSelectChain([])); // miss
    const ai = await import("@/lib/ai/ai");
    const providerSpy = vi.spyOn(ai, "resolveProvider").mockResolvedValue("claude");
    const modelSpy = vi
      .spyOn(ai, "resolveModel")
      .mockImplementation(async (_feature, provider) =>
        provider === "claude" ? "claude-opus-5" : "gemini-3.7-flash"
      );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const generate = vi.fn(async (resolved: { provider: string; model: string }) =>
      resolved.provider === "claude" ? [] : ["a"]
    );

    await getOrGenerateNameContent("al-malik", "verses", "en", 1, generate, isEmptyArr);

    // Previously the empty-but-not-thrown path had no log line at all — only
    // the incr("names_ai_fallback_used") metric, invisible outside /api/metrics.
    expect(errorSpy).toHaveBeenCalledWith(
      "Names: primary (claude) returned empty for al-malik/verses, falling back to Gemini"
    );
    providerSpy.mockRestore();
    modelSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("does not fall back to Gemini when the primary result is a detected refusal", async () => {
    mockSelect.mockReturnValue(makeSelectChain([])); // miss
    const ai = await import("@/lib/ai/ai");
    const providerSpy = vi.spyOn(ai, "resolveProvider").mockResolvedValue("claude");
    const modelSpy = vi.spyOn(ai, "resolveModel").mockResolvedValue("claude-opus-5");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const generate = vi.fn(async (ctx: { markRefusal: () => void }) => {
      ctx.markRefusal();
      return [];
    });

    const out = await getOrGenerateNameContent("al-malik", "verses", "en", 1, generate, isEmptyArr);

    expect(out).toEqual([]);
    // A refusal must not be silently backed by a different provider — no
    // second (Gemini) call at all, unlike an ordinary empty result.
    expect(generate).toHaveBeenCalledTimes(1);
    expect(mockInsert).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      "Names: claude refused for al-malik/verses, not falling back to Gemini"
    );
    providerSpy.mockRestore();
    modelSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("does not fall back when the primary provider is already Gemini", async () => {
    mockSelect.mockReturnValue(makeSelectChain([])); // miss
    const ai = await import("@/lib/ai/ai");
    const providerSpy = vi.spyOn(ai, "resolveProvider").mockResolvedValue("gemini");
    const modelSpy = vi.spyOn(ai, "resolveModel").mockResolvedValue("gemini-3.7-flash");
    const generate = vi.fn().mockResolvedValue([]);

    const out = await getOrGenerateNameContent("al-malik", "verses", "en", 1, generate, isEmptyArr);

    expect(out).toEqual([]);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(mockInsert).not.toHaveBeenCalled();
    providerSpy.mockRestore();
    modelSpy.mockRestore();
  });

  it("a Gemini fallback that itself throws still returns the primary's (empty) result, not an unhandled rejection", async () => {
    mockSelect.mockReturnValue(makeSelectChain([])); // miss
    const ai = await import("@/lib/ai/ai");
    const providerSpy = vi.spyOn(ai, "resolveProvider").mockResolvedValue("claude");
    const modelSpy = vi
      .spyOn(ai, "resolveModel")
      .mockImplementation(async (_feature, provider) =>
        provider === "claude" ? "claude-opus-5" : "gemini-3.7-flash"
      );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const generate = vi.fn(async (resolved: { provider: string; model: string }) => {
      if (resolved.provider === "gemini") throw new Error("GEMINI_API_KEY is not set");
      return [];
    });

    const out = await getOrGenerateNameContent("al-malik", "verses", "en", 1, generate, isEmptyArr);

    expect(out).toEqual([]);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(mockInsert).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      "Names: Gemini fallback failed for al-malik/verses:",
      expect.any(Error)
    );
    providerSpy.mockRestore();
    modelSpy.mockRestore();
    errorSpy.mockRestore();
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

  it("retries on Gemini when the primary throws, and caches the fallback's result", async () => {
    mockSelect.mockReturnValue(makeSelectChain([])); // miss
    const ai = await import("@/lib/ai/ai");
    const providerSpy = vi.spyOn(ai, "resolveProvider").mockResolvedValue("claude");
    const modelSpy = vi
      .spyOn(ai, "resolveModel")
      .mockImplementation(async (_feature, provider) =>
        provider === "claude" ? "claude-opus-5" : "gemini-3.7-flash"
      );

    const generate = vi.fn(async (resolved: { provider: string; model: string }) => {
      if (resolved.provider === "claude") throw new Error("claude overloaded");
      return ["ok"];
    });

    const out = await getOrGenerateNameContent("al-malik", "verses", "en", 1, generate, isEmptyArr);

    expect(out).toEqual(["ok"]);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    const values = mockValues.mock.calls[0][0] as Record<string, unknown>;
    expect(values.model).toBe("gemini-3.7-flash");
    providerSpy.mockRestore();
    modelSpy.mockRestore();
  });

  it("does not retry on Gemini when a throwing primary is already Gemini", async () => {
    mockSelect.mockReturnValue(makeSelectChain([])); // miss
    const ai = await import("@/lib/ai/ai");
    const providerSpy = vi.spyOn(ai, "resolveProvider").mockResolvedValue("gemini");
    const modelSpy = vi.spyOn(ai, "resolveModel").mockResolvedValue("gemini-3.7-flash");
    const generate = vi.fn().mockRejectedValue(new Error("gemini down"));

    await expect(
      getOrGenerateNameContent("al-malik", "verses", "en", 1, generate, isEmptyArr)
    ).rejects.toThrow("gemini down");
    expect(generate).toHaveBeenCalledTimes(1);
    expect(mockInsert).not.toHaveBeenCalled();
    providerSpy.mockRestore();
    modelSpy.mockRestore();
  });

  it("surfaces the original error when the primary throws AND the Gemini retry also fails, and clears the lock so the next call retries", async () => {
    mockSelect.mockReturnValue(makeSelectChain([])); // miss
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const generate = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockRejectedValueOnce(new Error("gemini down"))
      .mockResolvedValue(["ok"]);

    await expect(
      getOrGenerateNameContent("al-malik", "verses", "en", 1, generate, isEmptyArr)
    ).rejects.toThrow("boom");
    expect(generate).toHaveBeenCalledTimes(2); // primary + fallback attempt
    expect(errorSpy).toHaveBeenCalledWith(
      "Names: Gemini fallback failed for al-malik/verses:",
      expect.any(Error)
    );
    expect(mockInsert).not.toHaveBeenCalled();

    // lock released in finally → fresh call regenerates
    const out = await getOrGenerateNameContent("al-malik", "verses", "en", 1, generate, isEmptyArr);
    expect(out).toEqual(["ok"]);
    expect(generate).toHaveBeenCalledTimes(3);
    errorSpy.mockRestore();
  });
});

describe("getCachedNameContent", () => {
  beforeEach(() => {
    mockSelect.mockReset();
    mockInsert.mockClear();
    mockUpdateSet.mockClear();
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

  it("returns null and logs (instead of throwing) when the query itself rejects", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockSelect.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: () => Promise.reject(new Error("connection refused")),
        }),
      }),
    });

    const out = await getCachedNameContent<string>("ar-rahman", "reflection", "en", 1);

    expect(out).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe("getCachedNameContentBulk", () => {
  beforeEach(() => {
    mockSelect.mockReset();
    mockInsert.mockClear();
    mockUpdateSet.mockClear();
  });

  it("returns an empty map without querying when given no slugs", async () => {
    const out = await getCachedNameContentBulk<string>([], "meaning", "tr", 1);
    expect(out.size).toBe(0);
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("returns a map keyed by slug for every cache hit at the current version", async () => {
    mockSelect.mockReturnValue(
      makeSelectChain([
        { slug: "al-malik", data: JSON.stringify("Hükümdar"), version: 1 },
        { slug: "ar-rahman", data: JSON.stringify("Rahman"), version: 1 },
      ])
    );

    const out = await getCachedNameContentBulk<string>(
      ["al-malik", "ar-rahman", "as-salam"],
      "meaning",
      "tr",
      1
    );

    expect(out.get("al-malik")).toBe("Hükümdar");
    expect(out.get("ar-rahman")).toBe("Rahman");
    expect(out.has("as-salam")).toBe(false); // no row for this slug — a plain miss
  });

  it("excludes a row whose stored version is older than requested", async () => {
    mockSelect.mockReturnValue(
      makeSelectChain([{ slug: "al-malik", data: JSON.stringify("stale"), version: 1 }])
    );

    const out = await getCachedNameContentBulk<string>(["al-malik"], "meaning", "tr", 2);

    expect(out.has("al-malik")).toBe(false);
  });

  it("skips a corrupt row and logs, without throwing", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockSelect.mockReturnValue(
      makeSelectChain([{ slug: "al-malik", data: "{not json", version: 1 }])
    );

    const out = await getCachedNameContentBulk<string>(["al-malik"], "meaning", "tr", 1);

    expect(out.has("al-malik")).toBe(false);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("returns an empty map and logs (instead of throwing) when the query itself rejects", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockSelect.mockReturnValue({
      from: () => ({
        where: () => Promise.reject(new Error("connection refused")),
      }),
    });

    const out = await getCachedNameContentBulk<string>(["al-malik"], "meaning", "tr", 1);

    expect(out.size).toBe(0);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("never calls generate/insert — it is read-only", async () => {
    mockSelect.mockReturnValue(
      makeSelectChain([{ slug: "al-malik", data: JSON.stringify("Hükümdar"), version: 1 }])
    );
    await getCachedNameContentBulk<string>(["al-malik"], "meaning", "tr", 1);
    expect(mockInsert).not.toHaveBeenCalled();
  });
});

describe("getOrGenerateVerseReason", () => {
  beforeEach(() => {
    mockSelect.mockReset();
    mockInsert.mockClear();
    mockValues.mockClear();
    mockOnConflict.mockClear();
    mockOnConflictDoNothing.mockClear();
    mockUpdateSet.mockClear();
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
    // Test env defaults to Claude, so an empty translation triggers one
    // Gemini-fallback retry — also empty here, so still nothing to persist.
    expect(generate).toHaveBeenCalledTimes(2);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("falls back to Gemini once when the primary (Claude) translation is empty, and persists the Gemini result", async () => {
    mockSelect.mockReturnValue(makeSelectChain([])); // miss
    const ai = await import("@/lib/ai/ai");
    const providerSpy = vi.spyOn(ai, "resolveProvider").mockResolvedValue("claude");
    const modelSpy = vi
      .spyOn(ai, "resolveModel")
      .mockImplementation(async (_feature, provider) =>
        provider === "claude" ? "claude-opus-5" : "gemini-3.7-flash"
      );

    const generate = vi.fn(async (resolved: { provider: string; model: string }) =>
      resolved.provider === "claude" ? "" : "çeviri"
    );

    const out = await getOrGenerateVerseReason("ar-rahman", "2:255", "tr", generate);

    expect(out).toBe("çeviri");
    expect(generate).toHaveBeenCalledTimes(2);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    const values = mockValues.mock.calls[0][0] as Record<string, unknown>;
    expect(values.model).toBe("gemini-3.7-flash");
    providerSpy.mockRestore();
    modelSpy.mockRestore();
  });

  it("retries on Gemini when the primary translation call throws, and persists the fallback's string result", async () => {
    mockSelect.mockReturnValue(makeSelectChain([])); // miss
    const ai = await import("@/lib/ai/ai");
    const providerSpy = vi.spyOn(ai, "resolveProvider").mockResolvedValue("claude");
    const modelSpy = vi
      .spyOn(ai, "resolveModel")
      .mockImplementation(async (_feature, provider) =>
        provider === "claude" ? "claude-opus-5" : "gemini-3.7-flash"
      );

    const generate = vi.fn(async (resolved: { provider: string; model: string }) => {
      if (resolved.provider === "claude") throw new Error("claude overloaded");
      return "çeviri";
    });

    const out = await getOrGenerateVerseReason("ar-rahman", "2:255", "tr", generate);

    expect(out).toBe("çeviri");
    expect(generate).toHaveBeenCalledTimes(2);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    const values = mockValues.mock.calls[0][0] as Record<string, unknown>;
    expect(values.model).toBe("gemini-3.7-flash");
    providerSpy.mockRestore();
    modelSpy.mockRestore();
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

describe("legacy source_hash re-validation", () => {
  beforeEach(() => {
    mockSelect.mockReset();
    mockInsert.mockClear();
    mockValues.mockClear();
    mockUpdateSet.mockClear();
  });

  it("serves a fresh legacy row and backfills its hash", async () => {
    mockSelect
      .mockReturnValueOnce(
        makeSelectChain([
          {
            data: JSON.stringify("çevrilmiş tefekkür"),
            version: 1,
            sourceHash: null,
            updatedAt: new Date("2026-01-02T00:00:00Z"),
          },
        ])
      )
      .mockReturnValueOnce(makeSelectChain([{ updatedAt: new Date("2026-01-01T00:00:00Z") }]));
    const generate = vi.fn();
    const isEmpty = (v: string) => v.trim() === "";

    const out = await getOrGenerateNameContent(
      "ar-rahman",
      "reflection",
      "tr",
      1,
      generate,
      isEmpty,
      undefined,
      "current-hash"
    );

    expect(out).toBe("çevrilmiş tefekkür");
    expect(generate).not.toHaveBeenCalled();
    expect(mockUpdateSet).toHaveBeenCalledWith({ sourceHash: "current-hash" });
  });

  it("regenerates a legacy row whose English was rewritten after it", async () => {
    mockSelect
      .mockReturnValueOnce(
        makeSelectChain([
          {
            data: JSON.stringify("eski tefekkür"),
            version: 1,
            sourceHash: null,
            updatedAt: new Date("2026-01-01T00:00:00Z"),
          },
        ])
      )
      .mockReturnValueOnce(makeSelectChain([{ updatedAt: new Date("2026-01-02T00:00:00Z") }]));
    const ai = await import("@/lib/ai/ai");
    const providerSpy = vi.spyOn(ai, "resolveProvider").mockResolvedValue("gemini");
    const modelSpy = vi.spyOn(ai, "resolveModel").mockResolvedValue("gemini-3.7-flash");
    const generate = vi.fn().mockResolvedValue("yeni tefekkür");
    const isEmpty = (v: string) => v.trim() === "";

    const out = await getOrGenerateNameContent(
      "ar-rahman",
      "reflection",
      "tr",
      1,
      generate,
      isEmpty,
      undefined,
      "current-hash"
    );

    expect(out).toBe("yeni tefekkür");
    expect(generate).toHaveBeenCalledTimes(1);
    expect(mockUpdateSet).not.toHaveBeenCalled();
    providerSpy.mockRestore();
    modelSpy.mockRestore();
  });

  it("keeps serving a legacy meaning row without querying for an English row that cannot exist", async () => {
    mockSelect.mockReturnValueOnce(
      makeSelectChain([
        {
          data: JSON.stringify("eski anlam"),
          version: 1,
          sourceHash: null,
          updatedAt: new Date("2026-01-02T00:00:00Z"),
        },
      ])
    );
    const generate = vi.fn();
    const isEmpty = (v: string) => v.trim() === "";

    const out = await getOrGenerateNameContent(
      "ar-rahman",
      "meaning",
      "tr",
      1,
      generate,
      isEmpty,
      undefined,
      "current-hash"
    );

    expect(out).toBe("eski anlam");
    expect(generate).not.toHaveBeenCalled();
    expect(mockSelect).toHaveBeenCalledTimes(1);
    expect(mockUpdateSet).not.toHaveBeenCalled();
  });

  it("treats a legacy reflection as stale when its English row is missing", async () => {
    mockSelect
      .mockReturnValueOnce(
        makeSelectChain([
          {
            data: JSON.stringify("eski tefekkür"),
            version: 1,
            sourceHash: null,
            updatedAt: new Date("2026-01-02T00:00:00Z"),
          },
        ])
      )
      .mockReturnValueOnce(makeSelectChain([]));

    const out = await getCachedNameContent<string>("ar-rahman", "reflection", "tr", 1, "h");

    expect(out).toBeNull();
    expect(mockUpdateSet).not.toHaveBeenCalled();
  });

  it("getCachedNameContent returns null instead of throwing when the English lookup fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockSelect
      .mockReturnValueOnce(
        makeSelectChain([
          {
            data: JSON.stringify("eski tefekkür"),
            version: 1,
            sourceHash: null,
            updatedAt: new Date("2026-01-02T00:00:00Z"),
          },
        ])
      )
      .mockImplementationOnce(() => {
        throw new Error("db down");
      });

    const out = await getCachedNameContent<string>("ar-rahman", "reflection", "tr", 1, "h");

    expect(out).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("getCachedNameContentBulk skips a row whose English lookup fails and keeps the rest", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockSelect
      .mockReturnValueOnce(
        makeSelectChain([
          {
            slug: "al-malik",
            data: JSON.stringify("Hükümdar"),
            version: 1,
            sourceHash: null,
            updatedAt: new Date("2026-01-02T00:00:00Z"),
          },
          {
            slug: "ar-rahman",
            data: JSON.stringify("Rahman"),
            version: 1,
            sourceHash: "h2",
            updatedAt: new Date("2026-01-02T00:00:00Z"),
          },
        ])
      )
      .mockImplementationOnce(() => {
        throw new Error("db down");
      });

    const out = await getCachedNameContentBulk<string>(
      ["al-malik", "ar-rahman"],
      "reflection",
      "tr",
      1,
      new Map([
        ["al-malik", "h1"],
        ["ar-rahman", "h2"],
      ])
    );

    expect(out.has("al-malik")).toBe(false);
    expect(out.get("ar-rahman")).toBe("Rahman");
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("getCachedNameContent serves a fresh legacy row and hides a stale one", async () => {
    mockSelect
      .mockReturnValueOnce(
        makeSelectChain([
          {
            data: JSON.stringify("taze"),
            version: 1,
            sourceHash: null,
            updatedAt: new Date("2026-01-02T00:00:00Z"),
          },
        ])
      )
      .mockReturnValueOnce(makeSelectChain([{ updatedAt: new Date("2026-01-01T00:00:00Z") }]))
      .mockReturnValueOnce(
        makeSelectChain([
          {
            data: JSON.stringify("bayat"),
            version: 1,
            sourceHash: null,
            updatedAt: new Date("2026-01-01T00:00:00Z"),
          },
        ])
      )
      .mockReturnValueOnce(makeSelectChain([{ updatedAt: new Date("2026-01-02T00:00:00Z") }]));

    const fresh = await getCachedNameContent<string>("ar-rahman", "reflection", "tr", 1, "h");
    const stale = await getCachedNameContent<string>("al-malik", "reflection", "tr", 1, "h");
    expect(fresh).toBe("taze");
    expect(stale).toBeNull();
    expect(mockUpdateSet).toHaveBeenCalledTimes(1);
    expect(mockUpdateSet).toHaveBeenCalledWith({ sourceHash: "h" });
  });

  it("getCachedNameContentBulk validates each legacy row separately", async () => {
    mockSelect
      .mockReturnValueOnce(
        makeSelectChain([
          {
            slug: "al-malik",
            data: JSON.stringify("Hükümdar"),
            version: 1,
            sourceHash: null,
            updatedAt: new Date("2026-01-02T00:00:00Z"),
          },
          {
            slug: "ar-rahman",
            data: JSON.stringify("Rahman"),
            version: 1,
            sourceHash: null,
            updatedAt: new Date("2026-01-01T00:00:00Z"),
          },
        ])
      )
      .mockReturnValueOnce(makeSelectChain([{ updatedAt: new Date("2026-01-01T00:00:00Z") }]))
      .mockReturnValueOnce(makeSelectChain([{ updatedAt: new Date("2026-01-02T00:00:00Z") }]));

    const out = await getCachedNameContentBulk<string>(
      ["al-malik", "ar-rahman"],
      "reflection",
      "tr",
      1,
      new Map([
        ["al-malik", "h1"],
        ["ar-rahman", "h2"],
      ])
    );

    expect(out.get("al-malik")).toBe("Hükümdar");
    expect(out.has("ar-rahman")).toBe(false);
  });

  it("serves a fresh legacy verse reason and backfills its hash", async () => {
    mockSelect
      .mockReturnValueOnce(
        makeSelectChain([
          {
            reason: "eski sebep",
            sourceHash: null,
            createdAt: new Date("2026-01-02T00:00:00Z"),
          },
        ])
      )
      .mockReturnValueOnce(makeSelectChain([{ updatedAt: new Date("2026-01-01T00:00:00Z") }]));
    const generate = vi.fn();

    const out = await getOrGenerateVerseReason(
      "ar-rahman",
      "2:255",
      "tr",
      generate,
      undefined,
      "current-hash"
    );

    expect(out).toBe("eski sebep");
    expect(generate).not.toHaveBeenCalled();
    expect(mockUpdateSet).toHaveBeenCalledWith({ sourceHash: "current-hash" });
  });
});
