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

const { mockSelect, mockInsert, mockDelete, mockRateLimitOrNull } = vi.hoisted(() => ({
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
vi.mock("@/lib/infra/rate-limit", () => ({
  rateLimitOrNull: mockRateLimitOrNull,
}));

import { POST } from "@/app/api/share/route";
import Image from "@/app/api/share/[id]/opengraph-image";

// ── Helpers ────────────────────────────────────────────────────────────────────

const validVerse = {
  surah: 2,
  ayah: 255,
  ref: "2:255",
  arabicText: "arabic",
  translation: "Allah - there is no deity except Him.",
  surahName: "Al-Baqarah",
  surahNameArabic: "البقرة",
};

function postReq(body: unknown) {
  return new NextRequest("http://localhost/api/share", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_ID = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  mockSelect.mockReset().mockReturnValue(makeDbChain([]));
  mockInsert.mockReset().mockReturnValue(makeDbChain([]));
  mockDelete.mockReset().mockReturnValue(makeDbChain([]));
  mockRateLimitOrNull.mockReset().mockResolvedValue(null);
});

describe("POST /api/share", () => {
  it("returns 400 when a node is missing .verse", async () => {
    const res = await POST(postReq({ v: 1, nodes: [{}] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid canvas/i);
  });

  it("returns 400 when a node's verse is missing required fields", async () => {
    const res = await POST(postReq({ v: 1, nodes: [{ verse: { ref: "2:255" } }] }));
    expect(res.status).toBe(400);
  });

  it("returns 200 with an id for a well-formed canvas", async () => {
    const res = await POST(postReq({ v: 1, nodes: [{ verse: validVerse }] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.id).toBe("string");
    expect(mockInsert).toHaveBeenCalled();
  });

  it("returns 429 when the rate limiter reports over-limit", async () => {
    mockRateLimitOrNull.mockResolvedValue(
      NextResponse.json({ error: "Too many requests" }, { status: 429 })
    );
    const res = await POST(postReq({ v: 1, nodes: [{ verse: validVerse }] }));
    expect(res.status).toBe(429);
    expect(mockInsert).not.toHaveBeenCalled();
  });
});

describe("GET /api/share/[id]/opengraph-image", () => {
  function imageReq(id: string) {
    return Image({ params: Promise.resolve({ id }) });
  }

  it("falls back instead of throwing when stored data is invalid JSON", async () => {
    mockSelect.mockReturnValue(makeDbChain([{ id: VALID_ID, data: "not-json" }]));
    await expect(imageReq(VALID_ID)).resolves.toBeDefined();
  });

  it("falls back instead of throwing when a node is missing .verse", async () => {
    mockSelect.mockReturnValue(
      makeDbChain([{ id: VALID_ID, data: JSON.stringify({ v: 1, nodes: [{}] }) }])
    );
    await expect(imageReq(VALID_ID)).resolves.toBeDefined();
  });

  it("falls back instead of throwing when .verse is present but missing required fields", async () => {
    mockSelect.mockReturnValue(
      makeDbChain([
        { id: VALID_ID, data: JSON.stringify({ v: 1, nodes: [{ verse: { ref: "2:255" } }] }) },
      ])
    );
    await expect(imageReq(VALID_ID)).resolves.toBeDefined();
  });

  it("renders normally for well-formed stored data", async () => {
    mockSelect.mockReturnValue(
      makeDbChain([
        { id: VALID_ID, data: JSON.stringify({ v: 1, nodes: [{ verse: validVerse }] }) },
      ])
    );
    await expect(imageReq(VALID_ID)).resolves.toBeDefined();
  });
});
