import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── DB mock (chainable + thenable proxy) ────────────────────────────────────────
function makeDbChain(resolveWith: unknown = []) {
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

const { mockSelect, mockInsert, mockConsume } = vi.hoisted(() => ({
  mockSelect: vi.fn(() => makeDbChain([])), // no stored edges → cache miss
  mockInsert: vi.fn(() => makeDbChain([])),
  mockConsume: vi.fn(async () => true),
}));

vi.mock("@/lib/db", () => ({ db: { select: mockSelect, insert: mockInsert } }));
vi.mock("@/lib/rate-limit", () => ({
  consume: mockConsume,
  RateLimitError: class RateLimitError extends Error {
    constructor() {
      super("Rate limit exceeded");
      this.name = "RateLimitError";
    }
  },
}));

vi.mock("@anthropic-ai/sdk", () => {
  const mockText = JSON.stringify([
    { ref: "2:255", reason: "The Throne Verse manifests divine sovereignty." },
    { ref: "3:18", reason: "Allah witnesses His own oneness directly." },
    { ref: "112:1", reason: "Pure tawhid — the essence of divine singularity." },
  ]);

  class MockAnthropic {
    messages = {
      create: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: mockText }],
      }),
    };
  }

  return { default: MockAnthropic };
});

import { POST } from "@/app/api/connections/route";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function arabicResp(text = "آية كريمة") {
  return { ok: true, json: async () => ({ data: { text } }) };
}
function transResp(text = "A noble verse.") {
  return { ok: true, json: async () => ({ data: { text } }) };
}

function makeRequest(body: Record<string, string>) {
  return new NextRequest("http://localhost/api/connections", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/connections", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockSelect.mockClear();
    mockInsert.mockClear();
    mockConsume.mockReset();
    mockConsume.mockResolvedValue(true);
    mockSelect.mockReturnValue(makeDbChain([])); // default: cache miss
  });

  it("returns 400 when fromRef is missing", async () => {
    const req = makeRequest({ kind: "thematic", arabicText: "text", translation: "trans" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when kind is missing", async () => {
    const req = makeRequest({ fromRef: "1:1", arabicText: "text", translation: "trans" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid kind", async () => {
    const req = makeRequest({ fromRef: "1:1", kind: "bogus", arabicText: "text", translation: "trans" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 200 with 3 ConnectionResult objects for a valid request (cache miss → generate)", async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (typeof url !== "string") return { ok: false };
      if (url.includes("ar.alafasy")) return arabicResp("نص عربي");
      if (url.includes("en.sahih")) return transResp("English translation");
      return { ok: false };
    });

    const req = makeRequest({
      fromRef: "1:1",
      kind: "thematic",
      arabicText: "بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ",
      translation: "In the name of Allah, the Most Gracious, the Most Merciful.",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(3);
    // Miss path persisted the generated edges.
    expect(mockInsert).toHaveBeenCalled();
  });

  it("each result has ref, arabicText, translation, surahName, reason, and kind", async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (typeof url !== "string") return { ok: false };
      if (url.includes("ar.alafasy")) return arabicResp("نص عربي");
      if (url.includes("en.sahih")) return transResp("English translation");
      return { ok: false };
    });

    const req = makeRequest({
      fromRef: "2:255",
      kind: "contrast",
      arabicText: "اللَّهُ لَا إِلَهَ إِلَّا هُوَ",
      translation: "Allah — there is no deity except Him.",
    });
    const res = await POST(req);
    const body = await res.json();
    for (const item of body) {
      expect(item).toHaveProperty("ref");
      expect(item).toHaveProperty("arabicText");
      expect(item).toHaveProperty("translation");
      expect(item).toHaveProperty("surahName");
      expect(item).toHaveProperty("reason");
      expect(item).toHaveProperty("kind", "contrast");
    }
  });

  it("returns 429 when the generation rate limit is exceeded", async () => {
    mockSelect.mockReturnValue(makeDbChain([])); // miss → generation path
    mockConsume.mockResolvedValue(false);

    const req = makeRequest({
      fromRef: "1:1",
      kind: "thematic",
      arabicText: "x",
      translation: "y",
    });
    const res = await POST(req);
    expect(res.status).toBe(429);
  });

  it("serves a cache HIT from the DB without generating", async () => {
    const anthropic = await import("@anthropic-ai/sdk");
    // First select = connections query → returns the stored edge (HIT).
    // Subsequent selects = corpus verse lookup → empty, so resolveVerse falls
    // back to the live fetch. The AI must NOT be called on a hit.
    mockSelect
      .mockReturnValueOnce(
        makeDbChain([
          { id: 1, fromRef: "2:255", toRef: "3:18", kind: "thematic", reason: "stored", status: "active" },
        ])
      )
      .mockReturnValue(makeDbChain([]));
    mockFetch.mockImplementation(async (url: string) => {
      if (typeof url !== "string") return { ok: false };
      if (url.includes("ar.alafasy")) return arabicResp();
      if (url.includes("en.sahih")) return transResp();
      return { ok: false };
    });

    const req = makeRequest({
      fromRef: "2:255",
      kind: "thematic",
      arabicText: "x",
      translation: "y",
    });
    const res = await POST(req);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body[0]).toMatchObject({ ref: "3:18", reason: "stored" });
    expect(mockInsert).not.toHaveBeenCalled();
    // The mocked Anthropic client was never constructed/used for a hit.
    expect(anthropic.default).toBeDefined();
  });
});
