import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mocks must be declared before static imports so Vitest hoists them first
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}));

// The name routes now read/write a durable `name_content` cache via lib/db
// (see lib/name-content.ts). Mock the DB so the cache check is always a miss and
// the persist is a no-op — the routes then exercise their real generation path.
function makeDbChain(resolveWith: unknown[] = []) {
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
vi.mock("@/lib/db", () => ({
  db: {
    select: () => makeDbChain([]), // cache miss
    insert: () => ({ values: () => ({ onConflictDoUpdate: async () => undefined }) }),
  },
}));

vi.mock("@anthropic-ai/sdk", () => {
  const mockText = JSON.stringify([
    { ref: "2:255", reason: "Verse of the Throne manifests Al-Hayy and Al-Qayyum." },
    { ref: "3:18", reason: "Allah witnesses His own oneness." },
    { ref: "59:22", reason: "Enumerates divine attributes directly." },
    { ref: "112:1", reason: "Al-Ahad — pure singularity." },
    { ref: "24:35", reason: "The Light verse expresses An-Nur." },
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

// Static imports — must come after vi.mock declarations so mocks are active
import { GET as getAllNames } from "@/app/api/names/route";
import { GET as getNameVerses } from "@/app/api/names/[slug]/verses/route";

// Stub fetch AFTER static imports so vi.stubGlobal wins over any fetch patch
// that next/server applies during module initialization
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function arabicResp(text = "آية كريمة") {
  return { ok: true, json: async () => ({ data: { text } }) };
}
function transResp(text = "A noble verse.") {
  return { ok: true, json: async () => ({ data: { text } }) };
}

describe("GET /api/names", () => {
  it("returns all 99 divine names", async () => {
    const res = await getAllNames();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(99);
  });

  it("each name has id, slug, arabic, meaning, and category", async () => {
    const res = await getAllNames();
    const body = await res.json();
    for (const name of body) {
      expect(name).toHaveProperty("id");
      expect(name).toHaveProperty("slug");
      expect(name).toHaveProperty("arabic");
      expect(name).toHaveProperty("meaning");
      expect(name).toHaveProperty("category");
    }
  });
});

describe("GET /api/names/[slug]/verses", () => {
  beforeEach(() => mockFetch.mockReset());

  function params(slug: string) {
    return { params: Promise.resolve({ slug }) };
  }

  it("returns 404 for unknown slug", async () => {
    const req = new NextRequest("http://localhost/api/names/not-a-name/verses");
    const res = await getNameVerses(req, params("not-a-name"));
    expect(res.status).toBe(404);
  });

  it("returns verses array for known slug", async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (typeof url !== "string") return { ok: false };
      if (url.includes("ar.alafasy")) return arabicResp();
      if (url.includes("en.sahih")) return transResp();
      return { ok: false };
    });

    const req = new NextRequest("http://localhost/api/names/ar-rahman/verses");
    const res = await getNameVerses(req, params("ar-rahman"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
  });

  it("each verse has ref, arabicText, translation, surahName, and reason", async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (typeof url !== "string") return { ok: false };
      if (url.includes("ar.alafasy")) return arabicResp("نص عربي");
      if (url.includes("en.sahih")) return transResp("English translation");
      return { ok: false };
    });

    const req = new NextRequest("http://localhost/api/names/al-alim/verses");
    const res = await getNameVerses(req, params("al-alim"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.length).toBeGreaterThan(0);
    for (const verse of body) {
      expect(verse).toHaveProperty("ref");
      expect(verse).toHaveProperty("arabicText");
      expect(verse).toHaveProperty("translation");
      expect(verse).toHaveProperty("reason");
      expect(verse).toHaveProperty("surahName");
    }
  });
});
