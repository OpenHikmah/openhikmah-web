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
  mockReturning,
  mockGenerate,
  mockGenerateGrounded,
  mockDiscover,
  mockResolveVerse,
  mockConsume,
  mockIncr,
  mockTranslateReason,
} = vi.hoisted(() => {
  // Mirrors the real chain: .values(...).onConflictDoNothing().returning(...) —
  // `returning` resolves with the rows actually inserted (empty by default here,
  // matching every existing test's assumption that no row won a genuine
  // conflict-race; individual tests override this).
  const mockReturning = vi.fn().mockResolvedValue([]);
  const mockOnConflict = vi.fn(() => ({ returning: mockReturning }));
  const mockValues = vi.fn((..._args: unknown[]) => ({ onConflictDoNothing: mockOnConflict }));
  return {
    mockSelect: vi.fn(),
    mockInsert: vi.fn(() => ({ values: mockValues })),
    mockValues,
    mockOnConflict,
    mockReturning,
    mockGenerate: vi.fn(),
    mockGenerateGrounded: vi.fn(),
    mockDiscover: vi.fn(),
    mockResolveVerse: vi.fn(),
    mockConsume: vi.fn(),
    mockIncr: vi.fn(),
    mockTranslateReason: vi.fn(),
  };
});

vi.mock("@/lib/infra/db", () => ({ db: { select: mockSelect, insert: mockInsert } }));
vi.mock("@/lib/ai/translate", () => ({ translateReason: mockTranslateReason }));
const { ConnectionParseError } = vi.hoisted(() => ({
  ConnectionParseError: class ConnectionParseError extends Error {
    constructor(msg = "unparseable") {
      super(msg);
      this.name = "ConnectionParseError";
    }
  },
}));
vi.mock("@/lib/ai/connection-generator", () => ({
  generateConnections: mockGenerate,
  generateGroundedConnections: mockGenerateGrounded,
  ConnectionParseError,
}));
vi.mock("@/lib/ai/connection-discovery", () => ({ discoverCandidates: mockDiscover }));
vi.mock("@/lib/quran/verse-resolver", () => ({ resolveVerse: mockResolveVerse }));
vi.mock("@/lib/infra/rate-limit", () => ({
  consume: mockConsume,
  RateLimitError: class RateLimitError extends Error {},
}));
vi.mock("@/lib/infra/metrics", () => ({ incr: mockIncr }));

import { getConnections } from "@/lib/ai/graph-service";
import { RateLimitError } from "@/lib/infra/rate-limit";

function verse(ref: string): Verse {
  const [s, a] = ref.split(":");
  return {
    surah: parseInt(s, 10),
    ayah: parseInt(a, 10),
    ref: ref as VerseRef,
    arabicText: "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ",
    translation: "text",
    surahName: "Surah",
    surahNameArabic: "سورة",
  };
}

function result(ref: string): ConnectionResult {
  return { ...verse(ref), reason: "because", kind: "thematic" };
}

const SOURCE_ARABIC = "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ";
const source = { arabicText: SOURCE_ARABIC, translation: "tr" };

// getConnections resolves the connections provider+model once and threads the
// pair through to the generator. With no flag/env set it's the Claude default.
const RESOLVED = { provider: "claude", model: "claude-opus-4-7" };

describe("getConnections", () => {
  beforeEach(() => {
    mockSelect.mockReset();
    mockInsert.mockClear();
    mockValues.mockClear();
    mockOnConflict.mockClear();
    mockReturning.mockReset().mockResolvedValue([]);
    mockIncr.mockClear();
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
    expect(mockGenerate).toHaveBeenCalledWith(
      "1:1",
      SOURCE_ARABIC,
      "tr",
      "thematic",
      "en",
      RESOLVED
    );
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockValues).toHaveBeenCalledTimes(1);
    const persisted = mockValues.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(persisted).toHaveLength(2);
    expect(persisted[0]).toMatchObject({
      fromRef: "1:1",
      toRef: "2:255",
      kind: "thematic",
      locale: "en",
    });
    expect(out).toHaveLength(2);
  });

  it("threads an explicit provider+model override through to generation", async () => {
    mockSelect.mockReturnValue(makeSelectChain([])); // miss
    mockGenerate.mockResolvedValue([result("2:255")]);

    await getConnections("1:1", "thematic", source, {
      provider: "gemini",
      model: "gemini-3.5-flash-lite",
    });

    expect(mockGenerate).toHaveBeenCalledWith("1:1", SOURCE_ARABIC, "tr", "thematic", "en", {
      provider: "gemini",
      model: "gemini-3.5-flash-lite",
    });
  });

  it("on a persist failure, still returns the generated results but counts it — not silent", async () => {
    mockSelect.mockReturnValue(makeSelectChain([])); // miss
    mockGenerate.mockResolvedValue([result("2:255")]);
    mockReturning.mockRejectedValue(new Error("db down"));

    const out = await getConnections("1:1", "thematic", source);

    expect(out).toHaveLength(1); // caller still gets this request's results
    expect(mockIncr).toHaveBeenCalledWith("gen_persist_failed");
  });

  it("on a miss that generates nothing, does not write to the DB", async () => {
    mockSelect.mockReturnValue(makeSelectChain([]));
    mockGenerate.mockResolvedValue([]);

    const out = await getConnections("1:1", "root", source);

    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(mockInsert).not.toHaveBeenCalled();
    expect(out).toEqual([]);
  });

  it("propagates a ConnectionParseError from generation (not swallowed to []) and persists nothing", async () => {
    mockSelect.mockReturnValue(makeSelectChain([])); // miss
    mockGenerate.mockRejectedValue(new ConnectionParseError("no JSON array in AI response"));

    await expect(getConnections("1:1", "thematic", source)).rejects.toBeInstanceOf(
      ConnectionParseError
    );
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("propagates a ConnectionParseError from the grounded path too", async () => {
    mockSelect.mockReturnValue(makeSelectChain([])); // miss
    mockDiscover.mockResolvedValue(["2:255", "3:18"]); // grounded path
    mockGenerateGrounded.mockRejectedValue(new ConnectionParseError());

    await expect(getConnections("1:1", "thematic", source)).rejects.toBeInstanceOf(
      ConnectionParseError
    );
    expect(mockInsert).not.toHaveBeenCalled();
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

    expect(mockDiscover).toHaveBeenCalledWith("1:1", "thematic", undefined, []);
    expect(mockGenerateGrounded).toHaveBeenCalledTimes(1);
    expect(mockGenerateGrounded).toHaveBeenCalledWith(
      "1:1",
      SOURCE_ARABIC,
      "tr",
      "thematic",
      ["2:255", "3:18"],
      "en",
      RESOLVED
    );
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
    expect(mockGenerate).toHaveBeenCalledWith("1:1", SOURCE_ARABIC, "tr", "root", "en", RESOLVED);
    expect(out).toHaveLength(1);
  });

  it("threads excludeRefs into discoverCandidates on a miss", async () => {
    mockSelect.mockReturnValue(makeSelectChain([])); // miss
    mockDiscover.mockResolvedValue(["3:18"]);
    mockGenerateGrounded.mockResolvedValue([result("3:18")]);

    await getConnections("1:1", "thematic", source, { excludeRefs: ["2:255"] });

    expect(mockDiscover).toHaveBeenCalledWith("1:1", "thematic", undefined, ["2:255"]);
  });

  it("returns [] without falling back to legacy generation when excludeRefs exhausts candidates", async () => {
    mockSelect.mockReturnValue(makeSelectChain([])); // miss
    mockDiscover.mockResolvedValue([]); // nothing left to offer beyond excludeRefs

    const out = await getConnections("1:1", "thematic", source, { excludeRefs: ["2:255", "3:18"] });

    expect(mockGenerate).not.toHaveBeenCalled();
    expect(mockGenerateGrounded).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
    expect(out).toEqual([]);
  });

  it("still falls back to legacy generation on a true first-time miss (no excludeRefs)", async () => {
    mockSelect.mockReturnValue(makeSelectChain([])); // miss
    mockDiscover.mockResolvedValue([]); // no grounding data seeded yet
    mockGenerate.mockResolvedValue([result("2:255")]);

    const out = await getConnections("1:1", "thematic", source);

    expect(mockGenerate).toHaveBeenCalledTimes(1);
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

describe("getConnections — en-canonical localized reasons", () => {
  beforeEach(() => {
    mockSelect.mockReset();
    mockInsert.mockClear();
    mockValues.mockClear();
    mockOnConflict.mockClear();
    mockReturning.mockReset().mockResolvedValue([]);
    mockIncr.mockClear();
    mockGenerate.mockReset();
    mockGenerateGrounded.mockReset();
    mockDiscover.mockReset();
    mockResolveVerse.mockReset();
    mockConsume.mockReset();
    mockConsume.mockResolvedValue(true);
    mockDiscover.mockResolvedValue([]);
    mockResolveVerse.mockImplementation(async (ref: string) => verse(ref));
    mockTranslateReason.mockReset();
  });

  it("on a non-en miss with no en rows, generates the selection in ENGLISH then translates each reason", async () => {
    mockSelect.mockReturnValue(makeSelectChain([])); // tr read + en read both miss
    mockGenerate.mockResolvedValue([result("2:255"), result("3:18")]);
    mockTranslateReason.mockImplementation(async (reason: string) => `TR(${reason})`);

    const out = await getConnections("1:1", "thematic", source, { locale: "tr" });

    // selection derived once, in English — never natively per locale
    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(mockGenerate).toHaveBeenCalledWith(
      "1:1",
      SOURCE_ARABIC,
      "tr",
      "thematic",
      "en",
      RESOLVED
    );
    // each English reason translated for the requested locale
    expect(mockTranslateReason).toHaveBeenCalledTimes(2);
    expect(mockTranslateReason).toHaveBeenCalledWith("because", "Turkish", RESOLVED);
    // the persisted locale rows carry the translated text, tagged tr
    const trInsert = mockValues.mock.calls.at(-1)?.[0] as Array<Record<string, unknown>>;
    expect(trInsert).toEqual([
      expect.objectContaining({
        toRef: "2:255",
        kind: "thematic",
        locale: "tr",
        reason: "TR(because)",
      }),
      expect.objectContaining({ toRef: "3:18", locale: "tr", reason: "TR(because)" }),
    ]);
    expect(out.map((c) => c.reason)).toEqual(["TR(because)", "TR(because)"]);
  });

  it("translates the existing en rows without regenerating when they are already cached", async () => {
    // First select (tr cache read) misses; second (en cache read) hits.
    mockSelect.mockReturnValueOnce(makeSelectChain([])).mockReturnValue(
      makeSelectChain([
        {
          fromRef: "1:1",
          toRef: "2:255",
          kind: "thematic",
          reason: "en reason",
          status: "active",
        },
      ])
    );
    mockReturning.mockResolvedValue([{ toRef: "2:255" }]); // tr insert wins its row, no conflict re-read
    mockTranslateReason.mockResolvedValue("ru reason");

    const out = await getConnections("1:1", "thematic", source, { locale: "ru" });

    expect(mockGenerate).not.toHaveBeenCalled();
    expect(mockGenerateGrounded).not.toHaveBeenCalled();
    expect(mockTranslateReason).toHaveBeenCalledWith("en reason", "Russian", RESOLVED);
    expect(out[0]).toMatchObject({ ref: "2:255", reason: "ru reason" });
  });

  it("serves the English reason (and does not persist) when a row's translation fails", async () => {
    mockSelect.mockReturnValue(makeSelectChain([]));
    mockGenerate.mockResolvedValue([result("2:255")]);
    mockTranslateReason.mockResolvedValue(""); // rejected / failed translation

    const out = await getConnections("1:1", "thematic", source, { locale: "tr" });

    expect(out[0].reason).toBe("because"); // English reason served
    expect(mockIncr).toHaveBeenCalledWith("connections_live_translate_failed");
    // only the en insert happened — no tr row persisted
    const insertLocales = mockValues.mock.calls.map(
      (c) => (c[0] as Array<Record<string, unknown>>)[0]?.locale
    );
    expect(insertLocales).not.toContain("tr");
  });

  it("a concurrent en + tr miss derives the English selection ONCE, then tr translates it", async () => {
    mockSelect.mockReturnValue(makeSelectChain([]));
    let releaseGen!: (v: ConnectionResult[]) => void;
    mockGenerate.mockImplementation(
      () =>
        new Promise<ConnectionResult[]>((res) => {
          releaseGen = res;
        })
    );
    mockTranslateReason.mockImplementation(async (r: string) => `TR(${r})`);

    const all = Promise.all([
      getConnections("1:1", "thematic", source, { locale: "en" }),
      getConnections("1:1", "thematic", source, { locale: "tr" }),
    ]);
    await new Promise((r) => setTimeout(r, 0));
    expect(mockGenerate).toHaveBeenCalledTimes(1); // en generation coalesced across both

    releaseGen([result("2:255")]);
    await all;
    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(mockTranslateReason).toHaveBeenCalledTimes(1); // only the tr caller translates
  });

  it("a fully-translated locale cell is served from cache without generating or translating", async () => {
    const trRows = [
      { fromRef: "1:1", toRef: "2:255", kind: "thematic", reason: "tr A", status: "active" },
      { fromRef: "1:1", toRef: "3:18", kind: "thematic", reason: "tr B", status: "active" },
    ];
    const enRows = [
      { fromRef: "1:1", toRef: "2:255", kind: "thematic", reason: "en A", status: "active" },
      { fromRef: "1:1", toRef: "3:18", kind: "thematic", reason: "en B", status: "active" },
    ];
    mockSelect
      .mockReturnValueOnce(makeSelectChain(trRows))
      .mockReturnValue(makeSelectChain(enRows));

    const out = await getConnections("1:1", "thematic", source, { locale: "tr" });

    expect(mockGenerate).not.toHaveBeenCalled();
    expect(mockTranslateReason).not.toHaveBeenCalled();
    expect(out.map((c) => c.reason)).toEqual(["tr A", "tr B"]);
  });

  it("a PARTIAL locale cell is not a hit — it translates only the refs still missing", async () => {
    // tr has 1 of the 2 canonical en rows (a prior pass failed or ran out of budget).
    const trRows = [
      { fromRef: "1:1", toRef: "2:255", kind: "thematic", reason: "tr A", status: "active" },
    ];
    const enRows = [
      { fromRef: "1:1", toRef: "2:255", kind: "thematic", reason: "en A", status: "active" },
      { fromRef: "1:1", toRef: "3:18", kind: "thematic", reason: "en B", status: "active" },
    ];
    mockSelect
      .mockReturnValueOnce(makeSelectChain(trRows))
      .mockReturnValue(makeSelectChain(enRows));
    mockTranslateReason.mockImplementation(async (reason: string) => `TR(${reason})`);
    mockReturning.mockResolvedValue([{ toRef: "3:18" }]);

    const out = await getConnections("1:1", "thematic", source, { locale: "tr" });

    expect(mockGenerate).not.toHaveBeenCalled(); // en selection already exists
    // only the missing ref is translated; the already-translated one is reused
    expect(mockTranslateReason).toHaveBeenCalledTimes(1);
    expect(mockTranslateReason).toHaveBeenCalledWith("en B", "Turkish", RESOLVED);
    const trInsert = mockValues.mock.calls.at(-1)?.[0] as Array<Record<string, unknown>>;
    expect(trInsert).toEqual([
      expect.objectContaining({ toRef: "3:18", locale: "tr", reason: "TR(en B)" }),
    ]);
    expect(out.map((c) => c.reason)).toEqual(["tr A", "TR(en B)"]);
  });

  it("serves pre-#594 native locale rows (no en canonical) as a hit, without regenerating", async () => {
    const trRows = [
      { fromRef: "1:1", toRef: "2:255", kind: "thematic", reason: "native tr", status: "active" },
    ];
    mockSelect.mockReturnValueOnce(makeSelectChain(trRows)).mockReturnValue(makeSelectChain([])); // no en rows to compare against

    const out = await getConnections("1:1", "thematic", source, { locale: "tr" });

    expect(mockGenerate).not.toHaveBeenCalled();
    expect(mockTranslateReason).not.toHaveBeenCalled();
    expect(out.map((c) => c.reason)).toEqual(["native tr"]);
  });

  it("does not treat count-matching but ref-divergent locale rows as complete (a retired-and-replaced en edge)", async () => {
    // en canonical is now {3:18, 59:22} (an old ref was retired, a new one
    // added); tr still reflects the old canonical set {2:255, 3:18} — same
    // COUNT (2) but a different ref set.
    const trRows = [
      {
        fromRef: "1:1",
        toRef: "2:255",
        kind: "thematic",
        reason: "tr A (orphan)",
        status: "active",
      },
      { fromRef: "1:1", toRef: "3:18", kind: "thematic", reason: "tr B", status: "active" },
    ];
    const enRows = [
      { fromRef: "1:1", toRef: "3:18", kind: "thematic", reason: "en B", status: "active" },
      { fromRef: "1:1", toRef: "59:22", kind: "thematic", reason: "en C", status: "active" },
    ];
    mockSelect
      .mockReturnValueOnce(makeSelectChain(trRows))
      .mockReturnValue(makeSelectChain(enRows));
    mockTranslateReason.mockImplementation(async (reason: string) => `TR(${reason})`);
    mockReturning.mockResolvedValue([{ toRef: "59:22" }]);

    const out = await getConnections("1:1", "thematic", source, { locale: "tr" });

    expect(mockGenerate).not.toHaveBeenCalled(); // en selection already exists
    // only the genuinely missing canonical ref (59:22) is translated
    expect(mockTranslateReason).toHaveBeenCalledTimes(1);
    expect(mockTranslateReason).toHaveBeenCalledWith("en C", "Turkish", RESOLVED);
    // the orphaned ref (2:255, no longer canonical) is dropped from the result
    expect(out.map((c) => c.ref)).toEqual(["3:18", "59:22"]);
    expect(out.map((c) => c.reason)).toEqual(["tr B", "TR(en C)"]);
  });

  it("serves the existing partial locale rows instead of erroring when a repair is rate-limited", async () => {
    const trRows = [
      { fromRef: "1:1", toRef: "2:255", kind: "thematic", reason: "tr A", status: "active" },
    ];
    const enRows = [
      { fromRef: "1:1", toRef: "2:255", kind: "thematic", reason: "en A", status: "active" },
      { fromRef: "1:1", toRef: "3:18", kind: "thematic", reason: "en B", status: "active" },
    ];
    mockSelect
      .mockReturnValueOnce(makeSelectChain(trRows))
      .mockReturnValue(makeSelectChain(enRows));
    mockConsume.mockResolvedValue(false); // client is over budget

    const out = await getConnections("1:1", "thematic", source, {
      locale: "tr",
      clientKey: "9.9.9.9",
    });

    expect(out.map((c) => c.reason)).toEqual(["tr A"]); // served what's cached, not an error
    expect(mockTranslateReason).not.toHaveBeenCalled();
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("spends the client budget per translation and serves English once it is out", async () => {
    mockSelect.mockReturnValue(makeSelectChain([]));
    mockGenerate.mockResolvedValue([result("2:255"), result("3:18"), result("59:22")]);
    mockTranslateReason.mockImplementation(async (r: string) => `TR(${r})`);
    // Upfront miss consume passes; then the first per-row consume passes and the
    // rest are over budget.
    mockConsume.mockResolvedValueOnce(true).mockResolvedValueOnce(true).mockResolvedValue(false);

    const out = await getConnections("1:1", "thematic", source, {
      locale: "tr",
      clientKey: "9.9.9.9",
    });

    expect(mockTranslateReason).toHaveBeenCalledTimes(1); // stopped after the budget ran out
    expect(out.map((c) => c.reason)).toEqual(["TR(because)", "because", "because"]);
    // only the one successful translation is persisted
    const trInsert = mockValues.mock.calls.at(-1)?.[0] as Array<Record<string, unknown>>;
    expect(trInsert).toHaveLength(1);
    expect(trInsert[0]).toMatchObject({ toRef: "2:255", locale: "tr" });
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
    mockReturning.mockReset().mockResolvedValue([]);
    mockIncr.mockClear();
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

  it("does NOT coalesce a plain request with a 'get more' request (different excludeRefs)", async () => {
    // Grounding available only for the "get more" (excludeRefs) request, so if the
    // two requests wrongly shared a single-flight key, only one of the two
    // generation paths below would ever run.
    mockDiscover.mockImplementation(
      async (_ref: string, _kind: string, _limit?: number, excl?: string[]) =>
        excl && excl.length > 0 ? ["3:18"] : []
    );
    mockGenerate.mockImplementation(async () => [result("2:255")]);
    mockGenerateGrounded.mockImplementation(async () => [result("3:18")]);

    await Promise.all([
      getConnections("1:1", "thematic", source),
      getConnections("1:1", "thematic", source, { excludeRefs: ["2:255"] }),
    ]);
    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(mockGenerateGrounded).toHaveBeenCalledTimes(1);
  });

  it("does NOT coalesce misses resolved to different models (same verse+kind)", async () => {
    mockGenerate.mockImplementation(async () => [result("2:255")]);
    await Promise.all([
      getConnections("1:1", "thematic", source, {
        provider: "gemini",
        model: "gemini-3.5-flash",
      }),
      getConnections("1:1", "thematic", source, {
        provider: "gemini",
        model: "gemini-3.5-flash-lite",
      }),
    ]);
    expect(mockGenerate).toHaveBeenCalledTimes(2);
    expect(mockGenerate).toHaveBeenCalledWith("1:1", SOURCE_ARABIC, "tr", "thematic", "en", {
      provider: "gemini",
      model: "gemini-3.5-flash",
    });
    expect(mockGenerate).toHaveBeenCalledWith("1:1", SOURCE_ARABIC, "tr", "thematic", "en", {
      provider: "gemini",
      model: "gemini-3.5-flash-lite",
    });
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
