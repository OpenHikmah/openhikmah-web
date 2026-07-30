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

const { mockSelect, mockConsume, mockCallAI } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockConsume: vi.fn(),
  mockCallAI: vi.fn(),
}));

vi.mock("@/lib/infra/db", () => ({
  db: {
    select: mockSelect,
    insert: () => ({ values: () => ({ onConflictDoUpdate: async () => undefined }) }),
  },
}));
// The routes now call getUiLocale() (lib/i18n/request-prefs.ts), which reads
// next/headers' cookies() — unavailable outside a real Next request scope.
// No cookie set here means it resolves to the "en" default.
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

vi.mock("@/lib/infra/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/infra/rate-limit")>();
  return { ...actual, consume: mockConsume };
});

vi.mock("@/lib/ai/ai", () => ({ callAI: mockCallAI }));

import { GET as getReflection } from "@/app/api/names/[slug]/reflection/route";
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

const ROUTES: Array<{
  label: string;
  call: (slug: string) => Promise<Response>;
}> = [
  { label: "reflection", call: (slug) => getReflection(req(slug, "reflection"), params(slug)) },
  { label: "pairings", call: (slug) => getPairings(req(slug, "pairings"), params(slug)) },
  { label: "verses", call: (slug) => getVerses(req(slug, "verses"), params(slug)) },
];

describe("names AI routes — per-client rate limiting", () => {
  beforeEach(() => {
    mockSelect.mockReset();
    mockConsume.mockReset();
    mockCallAI.mockReset();
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({ ok: false });
  });

  for (const { label, call } of ROUTES) {
    it(`${label}: returns 429 on a cache miss when the limiter denies, without calling the AI`, async () => {
      mockSelect.mockReturnValue(makeSelectChain([])); // durable-cache miss
      mockConsume.mockResolvedValue(false);

      const res = await call("ar-rahman");

      expect(res.status).toBe(429);
      expect(mockConsume).toHaveBeenCalledTimes(1);
      // The budget must be keyed per client — the core guarantee of this gate.
      expect(mockConsume).toHaveBeenCalledWith(expect.stringMatching(/^names-gen:.+/));
      expect(mockCallAI).not.toHaveBeenCalled();
    });

    it(`${label}: serves a cache hit without consuming rate-limit budget`, async () => {
      const cached =
        label === "reflection" ? JSON.stringify("a cached reflection") : JSON.stringify([]);
      // version must match each route's current VERSION const (reflection/pairings: 1, verses: 2)
      const version = label === "verses" ? 2 : 1;
      mockSelect.mockReturnValue(makeSelectChain([{ data: cached, version }]));
      mockConsume.mockResolvedValue(false); // would deny — must never be asked

      const res = await call("ar-rahman");

      expect(res.status).toBe(200);
      expect(mockConsume).not.toHaveBeenCalled();
      expect(mockCallAI).not.toHaveBeenCalled();
    });
  }

  it("reflection: generates normally when the limiter allows", async () => {
    mockSelect.mockReturnValue(makeSelectChain([]));
    mockConsume.mockResolvedValue(true);
    mockCallAI.mockResolvedValue("A grounded reflection.");

    const res = await getReflection(req("ar-rahman", "reflection"), params("ar-rahman"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ reflection: "A grounded reflection." });
    expect(mockConsume).toHaveBeenCalledTimes(1);
  });

  it("pairings: generates normally when the limiter allows", async () => {
    mockSelect.mockReturnValue(makeSelectChain([]));
    mockConsume.mockResolvedValue(true);
    mockCallAI.mockResolvedValue(
      JSON.stringify([
        {
          transliteration: "Ar-Rahim",
          arabic: "الرَّحِيم",
          explanation: "Mercy paired with mercy.",
        },
      ])
    );

    const res = await getPairings(req("ar-rahman", "pairings"), params("ar-rahman"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(mockConsume).toHaveBeenCalledTimes(1);
    expect(mockCallAI).toHaveBeenCalledTimes(1);
  });

  it("verses: generates normally when the limiter allows", async () => {
    mockSelect.mockReturnValue(makeSelectChain([]));
    mockConsume.mockResolvedValue(true);
    // quran.com search stays ok:false → AI fallback path; alquran.cloud hydrates.
    mockCallAI.mockResolvedValue(JSON.stringify([{ ref: "2:255", reason: "Ayat al-Kursi." }]));
    mockFetch.mockImplementation(async (url: unknown) => {
      if (typeof url !== "string") return { ok: false };
      if (url.includes("api.alquran.cloud"))
        return { ok: true, json: async () => ({ data: { text: "نص" } }) };
      return { ok: false };
    });

    const res = await getVerses(req("ar-rahman", "verses"), params("ar-rahman"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(mockConsume).toHaveBeenCalledTimes(1);
    expect(mockCallAI).toHaveBeenCalled();
  });
});
