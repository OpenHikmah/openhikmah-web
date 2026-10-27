import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

function makeDbChain(resolveWith: unknown) {
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

const { mockSelect, mockGetVerses, mockResolveVerse } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockGetVerses: vi.fn(),
  mockResolveVerse: vi.fn(),
}));

vi.mock("@/lib/infra/db", () => ({ db: { select: mockSelect } }));
vi.mock("@/lib/quran/quran-corpus", async (importOriginal) => {
  // parseSharePayload validates refs with the real corpus; only verse loading is stubbed.
  const actual = await importOriginal<typeof import("@/lib/quran/quran-corpus")>();
  return { ...actual, getVerses: mockGetVerses };
});
vi.mock("@/lib/quran/verse-resolver", () => ({ resolveVerse: mockResolveVerse }));

import { hydrateSharePayload, loadSharePayload } from "@/lib/canvas/share-hydrate";
import { SHARE_TTL_MS } from "@/lib/canvas/share-canvas";
import { SHARE_VERSION, type SharePayload } from "@/lib/canvas/share-payload";
import type { Verse } from "@/types/quran";

const fatiha: Verse = {
  surah: 1,
  ayah: 1,
  ref: "1:1",
  arabicText: "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ",
  translation: "In the name of Allah, the Entirely Merciful, the Especially Merciful.",
  surahName: "Al-Fatihah",
  surahNameArabic: "الفاتحة",
};
const ikhlas: Verse = {
  surah: 112,
  ayah: 1,
  ref: "112:1",
  arabicText: "قُلْ هُوَ ٱللَّهُ أَحَدٌ",
  translation: 'Say, "He is Allah, [who is] One,',
  surahName: "Al-Ikhlas",
  surahNameArabic: "الإخلاص",
};

const payload: SharePayload = {
  v: SHARE_VERSION,
  nodes: [
    { id: "a", x: 0, y: 0, ref: "1:1", isRoot: true },
    { id: "b", x: 300, y: 0, ref: "112:1" },
  ],
  edges: [{ id: "e1", source: "a", target: "b", kind: "thematic" }],
};

beforeEach(() => {
  mockSelect.mockReset();
  mockGetVerses.mockReset();
  mockResolveVerse.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("loadSharePayload", () => {
  function row(over: Partial<{ data: string; createdAt: Date }> = {}) {
    return [{ id: "x", data: JSON.stringify(payload), createdAt: new Date(), ...over }];
  }

  it("is missing when no row exists", async () => {
    mockSelect.mockReturnValue(makeDbChain([]));
    expect(await loadSharePayload("x")).toEqual({ status: "missing" });
  });

  it("returns the parsed payload for a fresh, current-format row", async () => {
    mockSelect.mockReturnValue(makeDbChain(row()));
    expect(await loadSharePayload("x")).toEqual({ status: "ok", payload });
  });

  it("treats a row older than the TTL as missing, and one just inside it as live", async () => {
    mockSelect.mockReturnValue(
      makeDbChain(row({ createdAt: new Date(Date.now() - SHARE_TTL_MS - 1000) }))
    );
    expect(await loadSharePayload("x")).toEqual({ status: "missing" });

    mockSelect.mockReturnValue(
      makeDbChain(row({ createdAt: new Date(Date.now() - SHARE_TTL_MS + 60_000) }))
    );
    expect((await loadSharePayload("x")).status).toBe("ok");
  });

  it("reports a row whose data is not JSON as corrupt, and logs it", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    mockSelect.mockReturnValue(makeDbChain(row({ data: "{not json" })));
    expect(await loadSharePayload("x")).toEqual({ status: "corrupt" });
    expect(err).toHaveBeenCalled();
  });

  it("treats a row in an older payload format as missing", async () => {
    mockSelect.mockReturnValue(
      makeDbChain(row({ data: JSON.stringify({ v: 1, nodes: [], edges: [] }) }))
    );
    expect(await loadSharePayload("x")).toEqual({ status: "missing" });
  });
});

describe("hydrateSharePayload", () => {
  it("rebuilds nodes from the corpus, marks the root, and takes the edge reason from the graph", async () => {
    mockGetVerses.mockResolvedValue(
      new Map([
        ["1:1", fatiha],
        ["112:1", ikhlas],
      ])
    );
    mockSelect.mockReturnValue(
      makeDbChain([
        {
          fromRef: "1:1",
          toRef: "112:1",
          kind: "thematic",
          reason: "Both open with divine unity.",
        },
      ])
    );

    const canvas = await hydrateSharePayload(payload, "en.sahih");
    expect(mockGetVerses).toHaveBeenCalledWith(["1:1", "112:1"], "en.sahih");
    expect(canvas?.v).toBe(1);
    expect(canvas?.nodes).toEqual([
      { id: "a", x: 0, y: 0, verse: { ...fatiha, isRoot: true } },
      { id: "b", x: 300, y: 0, verse: ikhlas },
    ]);
    expect(canvas?.edges).toEqual([
      {
        id: "e1",
        source: "a",
        target: "b",
        kind: "thematic",
        label: "Both open with divine unity.",
        reason: "Both open with divine unity.",
      },
    ]);
    expect(mockResolveVerse).not.toHaveBeenCalled();
  });

  it("matches an edge stored in the opposite direction", async () => {
    mockGetVerses.mockResolvedValue(
      new Map([
        ["1:1", fatiha],
        ["112:1", ikhlas],
      ])
    );
    mockSelect.mockReturnValue(
      makeDbChain([{ fromRef: "112:1", toRef: "1:1", kind: "thematic", reason: "Reverse row." }])
    );
    const canvas = await hydrateSharePayload(payload);
    expect(canvas?.edges.map((e) => e.reason)).toEqual(["Reverse row."]);
  });

  it("drops an edge with no active graph row instead of showing client text", async () => {
    mockGetVerses.mockResolvedValue(
      new Map([
        ["1:1", fatiha],
        ["112:1", ikhlas],
      ])
    );
    mockSelect.mockReturnValue(makeDbChain([]));
    const canvas = await hydrateSharePayload(payload);
    expect(canvas?.nodes).toHaveLength(2);
    expect(canvas?.edges).toEqual([]);
  });

  it("does not query the graph when the payload has no edges", async () => {
    mockGetVerses.mockResolvedValue(new Map([["1:1", fatiha]]));
    const canvas = await hydrateSharePayload({
      v: SHARE_VERSION,
      nodes: [{ id: "a", x: 0, y: 0, ref: "1:1" }],
      edges: [],
    });
    expect(canvas?.edges).toEqual([]);
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("falls back to a live resolve for refs the corpus lacks", async () => {
    mockGetVerses.mockResolvedValue(new Map([["1:1", fatiha]]));
    mockResolveVerse.mockResolvedValue(ikhlas);
    mockSelect.mockReturnValue(makeDbChain([]));
    const canvas = await hydrateSharePayload(payload, "en.sahih");
    expect(mockResolveVerse).toHaveBeenCalledWith("112:1", "en.sahih");
    expect(canvas?.nodes[1].verse).toEqual(ikhlas);
  });

  it("returns null when a verse cannot be resolved anywhere", async () => {
    mockGetVerses.mockResolvedValue(new Map([["1:1", fatiha]]));
    mockResolveVerse.mockResolvedValue(null);
    expect(await hydrateSharePayload(payload)).toBeNull();
  });

  it("de-duplicates repeated refs when asking the corpus", async () => {
    mockGetVerses.mockResolvedValue(new Map([["1:1", fatiha]]));
    mockSelect.mockReturnValue(makeDbChain([]));
    await hydrateSharePayload({
      v: SHARE_VERSION,
      nodes: [
        { id: "a", x: 0, y: 0, ref: "1:1" },
        { id: "b", x: 1, y: 1, ref: "1:1" },
      ],
      edges: [],
    });
    expect(mockGetVerses).toHaveBeenCalledWith(["1:1"], undefined);
  });
});
