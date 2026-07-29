import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Chainable + thenable DB proxy (mirrors __tests__/lib/names/name-content.test.ts) ──
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

const { mockConsume, mockCallAI } = vi.hoisted(() => ({
  mockConsume: vi.fn(),
  mockCallAI: vi.fn(),
}));

vi.mock("@/lib/infra/db", () => ({
  db: {
    select: () => makeSelectChain([]), // durable cache always misses
    insert: () => ({ values: () => ({ onConflictDoUpdate: async () => undefined }) }),
  },
}));

vi.mock("@/lib/infra/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/infra/rate-limit")>();
  return { ...actual, consume: mockConsume };
});

vi.mock("@/lib/ai/ai", () => ({ callAI: mockCallAI }));

import { GET as getPairings } from "@/app/api/names/[slug]/pairings/route";
import { GET as getVerses } from "@/app/api/names/[slug]/verses/route";

// Stub fetch AFTER static imports so vi.stubGlobal wins over any fetch patch
// applied during next/server module initialization.
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function req(slug: string, path: string) {
  return new NextRequest(`http://localhost/api/names/${slug}/${path}`);
}
function params(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

describe("names AI routes — model output validation", () => {
  beforeEach(() => {
    mockConsume.mockReset().mockResolvedValue(true);
    mockCallAI.mockReset();
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({ ok: false }); // quran.com search yields no refs
  });

  it("pairings: parseable-but-wrong-shaped JSON (string array) returns empty, not a 500", async () => {
    mockCallAI.mockResolvedValue(JSON.stringify(["Ar-Rahim", "Al-Malik"]));

    const res = await getPairings(req("ar-rahman", "pairings"), params("ar-rahman"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("pairings: entries missing string fields are dropped, valid ones kept", async () => {
    mockCallAI.mockResolvedValue(
      JSON.stringify([
        {
          transliteration: "Ar-Rahim",
          arabic: "الرَّحِيم",
          explanation: "Balances majesty with mercy.",
        },
        { transliteration: 42, arabic: null },
        "junk",
      ])
    );

    const res = await getPairings(req("ar-rahman", "pairings"), params("ar-rahman"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].transliteration).toBe("Ar-Rahim");
  });

  it("verses: AI fallback refs outside real Quran bounds are dropped (no 500)", async () => {
    mockCallAI.mockResolvedValue(
      JSON.stringify([
        { ref: "2:300", reason: "out-of-range ayah" },
        { ref: "999:1", reason: "out-of-range surah" },
        { ref: "2:255", reason: 42 },
        "junk",
      ])
    );

    const res = await getVerses(req("ar-rahman", "verses"), params("ar-rahman"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("verses: a valid AI-fallback entry survives among malformed ones", async () => {
    mockCallAI.mockResolvedValue(
      JSON.stringify([{ ref: "2:255", reason: "Ayat al-Kursi." }, { ref: "0:0" }, null])
    );
    mockFetch.mockImplementation(async (url: unknown) => {
      if (typeof url !== "string") return { ok: false };
      if (url.includes("api.alquran.cloud"))
        return {
          ok: true,
          json: async () => ({ data: { text: "اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ" } }),
        };
      return { ok: false };
    });

    const res = await getVerses(req("ar-rahman", "verses"), params("ar-rahman"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].ref).toBe("2:255");
    expect(body[0].reason).toBe("Ayat al-Kursi.");
  });
});
