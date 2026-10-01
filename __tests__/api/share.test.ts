import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// ── Mocks ──────────────────────────────────────────────────────────────────────

function makeDbChain(resolveWith: unknown = []) {
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
        if (prop === "catch")
          return (rej: (e: unknown) => unknown) => Promise.resolve(resolveWith).catch(rej);
        if (prop === Symbol.toStringTag) return "MockChain";
        return () => chain;
      },
      apply() {
        return chain;
      },
    }
  );
  return chain;
}

const { mockSelect, mockInsert, mockDelete, mockRateLimitOrNull, mockGetVerses, mockResolveVerse } =
  vi.hoisted(() => ({
    mockGetVerses: vi.fn(async (): Promise<Map<string, unknown>> => new Map()),
    mockResolveVerse: vi.fn(async (): Promise<unknown> => null),
    mockSelect: vi.fn(() => makeDbChain([])),
    mockInsert: vi.fn(() => makeDbChain([])),
    mockDelete: vi.fn(() => makeDbChain([])),
    mockRateLimitOrNull: vi.fn(async (): Promise<NextResponse | null> => null),
  }));

vi.mock("@/lib/infra/db", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
    delete: mockDelete,
  },
}));
vi.mock("@/lib/quran/quran-corpus", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/quran/quran-corpus")>()),
  getVerses: mockGetVerses,
}));
vi.mock("@/lib/quran/verse-resolver", () => ({ resolveVerse: mockResolveVerse }));
vi.mock("@/lib/infra/rate-limit", () => ({
  rateLimitOrNull: mockRateLimitOrNull,
}));

import { POST } from "@/app/api/share/route";
import { GET } from "@/app/api/share/[id]/route";
import Image from "@/app/api/share/[id]/opengraph-image";

// ── Helpers ────────────────────────────────────────────────────────────────────

const ayatAlKursi = {
  surah: 2,
  ayah: 255,
  ref: "2:255",
  arabicText: "اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ",
  translation: "Allah - there is no deity except Him, the Ever-Living, the Sustainer of existence.",
  surahName: "Al-Baqarah",
  surahNameArabic: "البقرة",
};
const ikhlas = {
  surah: 112,
  ayah: 1,
  ref: "112:1",
  arabicText: "قُلْ هُوَ اللَّهُ أَحَدٌ",
  translation: 'Say, "He is Allah, [who is] One,"',
  surahName: "Al-Ikhlas",
  surahNameArabic: "الإخلاص",
};

const validPayload = {
  v: 2,
  nodes: [
    { id: "node-1", x: 0, y: 0, ref: "2:255", isRoot: true },
    { id: "node-2", x: 100, y: 50, ref: "112:1" },
  ],
  edges: [{ id: "edge-node-1-node-2", source: "node-1", target: "node-2", kind: "thematic" }],
};

function postReq(body: unknown) {
  return new NextRequest("http://localhost/api/share", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockInsertValues() {
  const values = vi.fn().mockResolvedValue(undefined);
  mockInsert.mockReturnValue({ values });
  return values;
}

const VALID_ID = "11111111-1111-1111-1111-111111111111";

function storedRow(data: unknown, createdAt = new Date()) {
  return {
    id: VALID_ID,
    data: typeof data === "string" ? data : JSON.stringify(data),
    createdAt,
  };
}

const activeConnection = {
  fromRef: "2:255",
  toRef: "112:1",
  kind: "thematic",
  reason: "Both verses affirm the absolute oneness of Allah.",
};

beforeEach(() => {
  mockSelect.mockReset().mockReturnValue(makeDbChain([]));
  mockInsert.mockReset().mockReturnValue(makeDbChain([]));
  mockDelete.mockReset().mockReturnValue(makeDbChain([]));
  mockRateLimitOrNull.mockReset().mockResolvedValue(null);
  mockGetVerses.mockReset().mockResolvedValue(
    new Map([
      ["2:255", ayatAlKursi],
      ["112:1", ikhlas],
    ])
  );
  mockResolveVerse.mockReset().mockResolvedValue(null);
});

describe("POST /api/share", () => {
  it("returns 200 with an id and stores only the sanitized structural payload", async () => {
    const values = mockInsertValues();
    const res = await POST(postReq(validPayload));
    expect(res.status).toBe(200);
    expect(typeof (await res.json()).id).toBe("string");
    expect(JSON.parse(values.mock.calls[0][0].data)).toEqual(validPayload);
  });

  it("never stores forged verse text, translations or edge reasons", async () => {
    const values = mockInsertValues();
    const res = await POST(
      postReq({
        ...validPayload,
        nodes: [
          {
            ...validPayload.nodes[0],
            arabicText: "forged arabic",
            translation: "forged translation",
            surahName: "forged",
          },
          validPayload.nodes[1],
        ],
        edges: [{ ...validPayload.edges[0], reason: "forged reason", label: "forged label" }],
      })
    );
    expect(res.status).toBe(200);
    const stored = values.mock.calls[0][0].data as string;
    expect(stored).not.toMatch(/forged/);
    expect(JSON.parse(stored)).toEqual(validPayload);
  });

  it("returns 400 for the old v1 format", async () => {
    const res = await POST(postReq({ v: 1, nodes: [{ verse: ayatAlKursi }], edges: [] }));
    expect(res.status).toBe(400);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("returns 400 for an unknown verse ref", async () => {
    const res = await POST(
      postReq({ ...validPayload, nodes: [{ id: "node-1", x: 0, y: 0, ref: "1:8" }], edges: [] })
    );
    expect(res.status).toBe(400);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("returns 400 when edges are missing or malformed", async () => {
    for (const edges of [
      undefined,
      "x",
      [{ id: "e", source: "node-1", target: "ghost", kind: "thematic" }],
    ]) {
      const res = await POST(postReq({ ...validPayload, edges }));
      expect(res.status).toBe(400);
    }
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("returns 400 for an edge kind outside EdgeKind", async () => {
    const res = await POST(
      postReq({ ...validPayload, edges: [{ ...validPayload.edges[0], kind: "forged" }] })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid JSON", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/share", { method: "POST", body: "not-json" })
    );
    expect(res.status).toBe(400);
  });

  it("returns 429 when the rate limiter reports over-limit", async () => {
    mockRateLimitOrNull.mockResolvedValue(
      NextResponse.json({ error: "Too many requests" }, { status: 429 })
    );
    const res = await POST(postReq(validPayload));
    expect(res.status).toBe(429);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("returns 400 when the node count exceeds the 500-node cap", async () => {
    const nodes = Array.from({ length: 501 }, (_, i) => ({
      id: `n${i}`,
      x: 0,
      y: 0,
      ref: "2:255",
    }));
    const res = await POST(postReq({ v: 2, nodes, edges: [] }));
    expect(res.status).toBe(400);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("accepts exactly 500 nodes", async () => {
    mockInsertValues();
    const nodes = Array.from({ length: 500 }, (_, i) => ({
      id: `n${i}`,
      x: 0,
      y: 0,
      ref: "2:255",
    }));
    const res = await POST(postReq({ v: 2, nodes, edges: [] }));
    expect(res.status).toBe(200);
  });
});

describe("GET /api/share/[id]", () => {
  function getReq(id: string) {
    return GET(new Request(`http://localhost/api/share/${id}`), {
      params: Promise.resolve({ id }),
    });
  }

  it("returns 429 when the rate limiter reports over-limit", async () => {
    mockRateLimitOrNull.mockResolvedValue(
      NextResponse.json({ error: "Too many requests" }, { status: 429 })
    );
    const res = await getReq(VALID_ID);
    expect(res.status).toBe(429);
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("rehydrates verse text and edge reasons from the corpus and graph", async () => {
    mockSelect
      .mockReturnValueOnce(makeDbChain([storedRow(validPayload)]))
      .mockReturnValueOnce(makeDbChain([activeConnection]));
    const res = await getReq(VALID_ID);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      v: 1,
      nodes: [
        { id: "node-1", x: 0, y: 0, verse: { ...ayatAlKursi, isRoot: true } },
        { id: "node-2", x: 100, y: 50, verse: ikhlas },
      ],
      edges: [
        {
          id: "edge-node-1-node-2",
          source: "node-1",
          target: "node-2",
          kind: "thematic",
          label: activeConnection.reason.slice(0, 60),
          reason: activeConnection.reason,
        },
      ],
    });
  });

  it("ignores any text smuggled into a stored row, using the corpus instead", async () => {
    const tampered = {
      ...validPayload,
      nodes: [
        { ...validPayload.nodes[0], arabicText: "forged", translation: "forged" },
        validPayload.nodes[1],
      ],
    };
    mockSelect
      .mockReturnValueOnce(makeDbChain([storedRow(tampered)]))
      .mockReturnValueOnce(makeDbChain([activeConnection]));
    const body = await (await getReq(VALID_ID)).json();
    expect(JSON.stringify(body)).not.toMatch(/forged/);
    expect(body.nodes[0].verse.arabicText).toBe(ayatAlKursi.arabicText);
  });

  it("matches an edge whose graph row runs in the opposite direction", async () => {
    mockSelect
      .mockReturnValueOnce(makeDbChain([storedRow(validPayload)]))
      .mockReturnValueOnce(
        makeDbChain([{ ...activeConnection, fromRef: "112:1", toRef: "2:255" }])
      );
    const body = await (await getReq(VALID_ID)).json();
    expect(body.edges).toHaveLength(1);
    expect(body.edges[0].reason).toBe(activeConnection.reason);
  });

  it("drops an edge that has no active graph row", async () => {
    mockSelect
      .mockReturnValueOnce(makeDbChain([storedRow(validPayload)]))
      .mockReturnValueOnce(makeDbChain([{ ...activeConnection, kind: "contrast" }]));
    const body = await (await getReq(VALID_ID)).json();
    expect(body.nodes).toHaveLength(2);
    expect(body.edges).toEqual([]);
  });

  it("returns an empty edges array for a share without edges", async () => {
    mockSelect.mockReturnValueOnce(
      makeDbChain([storedRow({ ...validPayload, nodes: [validPayload.nodes[0]], edges: [] })])
    );
    const body = await (await getReq(VALID_ID)).json();
    expect(body.edges).toEqual([]);
    expect(mockSelect).toHaveBeenCalledTimes(1);
  });

  it("falls back to a live lookup for a ref missing from the corpus", async () => {
    mockGetVerses.mockResolvedValue(new Map([["2:255", ayatAlKursi]]));
    mockResolveVerse.mockResolvedValue(ikhlas);
    mockSelect
      .mockReturnValueOnce(makeDbChain([storedRow(validPayload)]))
      .mockReturnValueOnce(makeDbChain([activeConnection]));
    const res = await getReq(VALID_ID);
    expect(res.status).toBe(200);
    expect(mockResolveVerse).toHaveBeenCalledWith("112:1");
  });

  it("returns 500 when a verse resolves nowhere", async () => {
    mockGetVerses.mockResolvedValue(new Map());
    mockSelect.mockReturnValueOnce(makeDbChain([storedRow(validPayload)]));
    const res = await getReq(VALID_ID);
    expect(res.status).toBe(500);
  });

  it("returns 404 for a row stored in the old v1 format", async () => {
    mockSelect.mockReturnValueOnce(
      makeDbChain([storedRow({ v: 1, nodes: [{ id: "node-1", x: 0, y: 0, verse: ayatAlKursi }] })])
    );
    const res = await getReq(VALID_ID);
    expect(res.status).toBe(404);
  });

  it("returns 404 for a row past the 30-day TTL", async () => {
    const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    mockSelect.mockReturnValueOnce(makeDbChain([storedRow(validPayload, old)]));
    const res = await getReq(VALID_ID);
    expect(res.status).toBe(404);
  });

  it("returns 500 for corrupted stored JSON", async () => {
    mockSelect.mockReturnValueOnce(makeDbChain([storedRow("not-json")]));
    const res = await getReq(VALID_ID);
    expect(res.status).toBe(500);
  });

  it("returns 404 when no row exists", async () => {
    const res = await getReq(VALID_ID);
    expect(res.status).toBe(404);
  });

  it("returns 404 for a malformed id without querying the db", async () => {
    const res = await getReq("not-a-uuid");
    expect(res.status).toBe(404);
    expect(mockSelect).not.toHaveBeenCalled();
  });
});

describe("GET /api/share/[id]/opengraph-image", () => {
  function imageReq(id: string) {
    return Image({ params: Promise.resolve({ id }) });
  }

  it("falls back instead of throwing when stored data is invalid JSON", async () => {
    mockSelect.mockReturnValue(makeDbChain([storedRow("not-json")]));
    await expect(imageReq(VALID_ID)).resolves.toBeDefined();
    expect(mockResolveVerse).not.toHaveBeenCalled();
  });

  it("falls back for a row in the old v1 format without reading its stored text", async () => {
    mockSelect.mockReturnValue(
      makeDbChain([
        storedRow({ v: 1, nodes: [{ verse: { ...ayatAlKursi, translation: "forged" } }] }),
      ])
    );
    await expect(imageReq(VALID_ID)).resolves.toBeDefined();
    expect(mockResolveVerse).not.toHaveBeenCalled();
  });

  it("falls back when the first verse cannot be resolved", async () => {
    mockSelect.mockReturnValue(makeDbChain([storedRow(validPayload)]));
    await expect(imageReq(VALID_ID)).resolves.toBeDefined();
    expect(mockResolveVerse).toHaveBeenCalledWith("2:255");
  });

  it("renders from the corpus verse for well-formed stored data", async () => {
    mockResolveVerse.mockResolvedValue(ayatAlKursi);
    mockSelect.mockReturnValue(makeDbChain([storedRow(validPayload)]));
    const res = await imageReq(VALID_ID);
    expect(res.headers.get("Cache-Control")).toContain("immutable");
  });

  it("falls back for a malformed id without querying the db", async () => {
    await expect(imageReq("nope")).resolves.toBeDefined();
    expect(mockSelect).not.toHaveBeenCalled();
  });
});
