import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Verse, VerseRef, ConnectionResult } from "@/types/quran";

// ── DB mock: select() resolves to a configurable result; insert() is chainable ──
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
  mockGenerate,
  mockGenerateGrounded,
  mockDiscover,
  mockResolveVerse,
  mockConsume,
} = vi.hoisted(() => {
  const mockOnConflict = vi.fn().mockResolvedValue(undefined);
  const mockValues = vi.fn((..._args: unknown[]) => ({ onConflictDoNothing: mockOnConflict }));
  return {
    mockSelect: vi.fn(),
    mockInsert: vi.fn(() => ({ values: mockValues })),
    mockValues,
    mockOnConflict,
    mockGenerate: vi.fn(),
    mockGenerateGrounded: vi.fn(),
    mockDiscover: vi.fn(),
    mockResolveVerse: vi.fn(),
    mockConsume: vi.fn(),
  };
});

vi.mock("@/lib/infra/db", () => ({ db: { select: mockSelect, insert: mockInsert } }));
vi.mock("@/lib/ai/connection-generator", () => ({
  generateConnections: mockGenerate,
  generateGroundedConnections: mockGenerateGrounded,
}));
vi.mock("@/lib/ai/connection-discovery", () => ({ discoverCandidates: mockDiscover }));
vi.mock("@/lib/quran/verse-resolver", () => ({ resolveVerse: mockResolveVerse }));
vi.mock("@/lib/infra/rate-limit", () => ({
  consume: mockConsume,
  RateLimitError: class RateLimitError extends Error {},
}));

import { getConnections } from "@/lib/ai/graph-service";
import { RateLimitError } from "@/lib/infra/rate-limit";

function verse(ref: string): Verse {
  const [s, a] = ref.split(":");
  return {
    surah: parseInt(s, 10),
    ayah: parseInt(a, 10),
    ref: ref as VerseRef,
    arabicText: "نص",
    translation: "text",
    surahName: "Surah",
    surahNameArabic: "سورة",
  };
}

function result(ref: string): ConnectionResult {
  return { ...verse(ref), reason: "because", kind: "thematic" };
}

const source = { arabicText: "ar", translation: "tr" };

describe("getConnections", () => {
  beforeEach(() => {
    mockSelect.mockReset();
    mockInsert.mockClear();
    mockValues.mockClear();
    mockOnConflict.mockClear();
    mockGenerate.mockReset();
    mockGenerateGrounded.mockReset();
    mockDiscover.mockReset();
    mockResolveVerse.mockReset();
    mockConsume.mockReset();
    mockConsume.mockResolvedValue(true);
    // Default: no grounding data → legacy generation path.
    mockDiscover.mockResolvedValue([]);
    mockResolveVerse.mockImplementation(async (ref: string) => verse(ref));
  });

  it("serves from the DB on a hit WITHOUT calling the AI", async () => {
    mockSelect.mockReturnValue(
      makeSelectChain([
        {
          id: 1,
          fromRef: "1:1",
          toRef: "2:255",
          kind: "thematic",
          reason: "stored reason",
          status: "active",
        },
      ])
    );

    const out = await getConnections("1:1", "thematic", source);

    expect(mockGenerate).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ ref: "2:255", reason: "stored reason", kind: "thematic" });
  });

  it("on a miss, generates exactly once and persists the result", async () => {
    mockSelect.mockReturnValue(makeSelectChain([])); // no stored edges
    mockGenerate.mockResolvedValue([result("2:255"), result("3:18")]);

    const out = await getConnections("1:1", "thematic", source);

    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(mockGenerate).toHaveBeenCalledWith("1:1", "ar", "tr", "thematic");
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockValues).toHaveBeenCalledTimes(1);
    const persisted = mockValues.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(persisted).toHaveLength(2);
    expect(persisted[0]).toMatchObject({ fromRef: "1:1", toRef: "2:255", kind: "thematic" });
    expect(out).toHaveLength(2);
  });

  it("on a miss that generates nothing, does not write to the DB", async () => {
    mockSelect.mockReturnValue(makeSelectChain([]));
    mockGenerate.mockResolvedValue([]);

    const out = await getConnections("1:1", "root", source);

    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(mockInsert).not.toHaveBeenCalled();
    expect(out).toEqual([]);
  });

  it("rate-limits the generation path: over budget throws and does not generate", async () => {
    mockSelect.mockReturnValue(makeSelectChain([])); // miss
    mockConsume.mockResolvedValue(false);

    await expect(
      getConnections("1:1", "thematic", source, { clientKey: "1.2.3.4" })
    ).rejects.toBeInstanceOf(RateLimitError);

    expect(mockConsume).toHaveBeenCalledWith("gen:1.2.3.4");
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("does NOT rate-limit a cache hit even when a clientKey is given", async () => {
    mockSelect.mockReturnValue(
      makeSelectChain([
        {
          id: 1,
          fromRef: "1:1",
          toRef: "2:255",
          kind: "thematic",
          reason: "stored",
          status: "active",
        },
      ])
    );

    const out = await getConnections("1:1", "thematic", source, { clientKey: "1.2.3.4" });
    expect(mockConsume).not.toHaveBeenCalled();
    expect(out).toHaveLength(1);
  });

  it("generates when under budget", async () => {
    mockSelect.mockReturnValue(makeSelectChain([])); // miss
    mockConsume.mockResolvedValue(true);
    mockGenerate.mockResolvedValue([result("2:255")]);

    const out = await getConnections("1:1", "thematic", source, { clientKey: "1.2.3.4" });
    expect(mockConsume).toHaveBeenCalledTimes(1);
    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(out).toHaveLength(1);
  });

  it("on a miss WITH grounding data, uses grounded generation, not legacy", async () => {
    mockSelect.mockReturnValue(makeSelectChain([])); // miss
    mockDiscover.mockResolvedValue(["2:255", "3:18"]);
    mockGenerateGrounded.mockResolvedValue([result("2:255")]);

    const out = await getConnections("1:1", "thematic", source);

    expect(mockDiscover).toHaveBeenCalledWith("1:1", "thematic");
    expect(mockGenerateGrounded).toHaveBeenCalledTimes(1);
    expect(mockGenerateGrounded).toHaveBeenCalledWith("1:1", "ar", "tr", "thematic", [
      "2:255",
      "3:18",
    ]);
    expect(mockGenerate).not.toHaveBeenCalled(); // legacy path skipped
    expect(out).toHaveLength(1);
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it("falls back to legacy generation when discovery returns no candidates", async () => {
    mockSelect.mockReturnValue(makeSelectChain([])); // miss
    mockDiscover.mockResolvedValue([]);
    mockGenerate.mockResolvedValue([result("2:255")]);

    const out = await getConnections("1:1", "root", source);

    expect(mockGenerateGrounded).not.toHaveBeenCalled();
    expect(mockGenerate).toHaveBeenCalledWith("1:1", "ar", "tr", "root");
    expect(out).toHaveLength(1);
  });

  it("drops stored edges whose target verse no longer resolves", async () => {
    mockSelect.mockReturnValue(
      makeSelectChain([
        { id: 1, fromRef: "1:1", toRef: "2:255", kind: "thematic", reason: "ok", status: "active" },
        {
          id: 2,
          fromRef: "1:1",
          toRef: "9:999",
          kind: "thematic",
          reason: "broken",
          status: "active",
        },
      ])
    );
    mockResolveVerse.mockImplementation(async (ref: string) =>
      ref === "9:999" ? null : verse(ref)
    );

    const out = await getConnections("1:1", "thematic", source);
    expect(out.map((c) => c.ref)).toEqual(["2:255"]);
  });
});

describe("getConnections — single-flight de-duplication", () => {
  const tick = () => new Promise((r) => setTimeout(r, 0));
  let releaseGen: (v: ConnectionResult[]) => void;

  beforeEach(() => {
    mockSelect.mockReset().mockReturnValue(makeSelectChain([])); // always a cache miss
    mockInsert.mockClear();
    mockValues.mockClear();
    mockOnConflict.mockClear();
    mockDiscover.mockReset().mockResolvedValue([]); // no grounding → legacy generate path
    mockResolveVerse.mockReset().mockImplementation(async (ref: string) => verse(ref));
    mockConsume.mockReset().mockResolvedValue(true);
    mockGenerateGrounded.mockReset();
    // Hold generation "in flight" until a test releases it.
    mockGenerate.mockReset().mockImplementation(
      () =>
        new Promise<ConnectionResult[]>((res) => {
          releaseGen = res;
        })
    );
  });

  it("coalesces concurrent identical misses into ONE generation", async () => {
    const all = Promise.all([
      getConnections("1:1", "thematic", source),
      getConnections("1:1", "thematic", source),
      getConnections("1:1", "thematic", source),
    ]);

    // Leader reaches generation; the two followers join the in-flight promise.
    await tick();
    expect(mockGenerate).toHaveBeenCalledTimes(1);

    releaseGen([result("2:255")]);
    const [a, b, c] = await all;
    expect(a).toHaveLength(1);
    expect(b).toBe(a); // followers receive the very same resolved array
    expect(c).toBe(a);
    expect(mockInsert).toHaveBeenCalledTimes(1); // persisted once, not per-caller
  });

  it("does NOT coalesce different verse+kind keys", async () => {
    mockGenerate.mockImplementation(async () => [result("2:255")]); // resolve immediately
    await Promise.all([
      getConnections("1:1", "thematic", source),
      getConnections("1:1", "root", source), // different kind → different key
      getConnections("2:1", "thematic", source), // different ref → different key
    ]);
    expect(mockGenerate).toHaveBeenCalledTimes(3);
  });

  it("releases the lock so a later sequential miss generates again", async () => {
    mockGenerate.mockImplementation(async () => [result("2:255")]);
    await getConnections("1:1", "thematic", source);
    await getConnections("1:1", "thematic", source);
    expect(mockGenerate).toHaveBeenCalledTimes(2);
  });

  it("surfaces a generation error and clears the lock so the next call retries", async () => {
    mockGenerate
      .mockRejectedValueOnce(new Error("ai down"))
      .mockImplementation(async () => [result("2:255")]);
    await expect(getConnections("1:1", "thematic", source)).rejects.toThrow("ai down");
    // finally{} cleared the in-flight entry → a fresh call generates again
    const out = await getConnections("1:1", "thematic", source);
    expect(out).toHaveLength(1);
    expect(mockGenerate).toHaveBeenCalledTimes(2);
  });
});
