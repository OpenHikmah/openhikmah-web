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

const { mockSelect, mockConsume, mockCallAI, mockVerifyAI, mockCookies } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockConsume: vi.fn(),
  mockCallAI: vi.fn(),
  mockVerifyAI: vi.fn(),
  // The routes now call getUiLocale() (lib/i18n/request-prefs.ts), which reads
  // next/headers' cookies() — unavailable outside a real Next request scope.
  // Defaults to no cookie set (→ "en"); individual tests can override.
  mockCookies: vi.fn(async () => ({
    get: (_name: string) => undefined as { value: string } | undefined,
  })),
}));

vi.mock("@/lib/infra/db", () => ({
  db: {
    select: mockSelect,
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: async () => undefined,
        onConflictDoNothing: () => ({ returning: async () => [{ reason: "unused" }] }),
      }),
    }),
  },
}));
vi.mock("next/headers", () => ({ cookies: mockCookies }));

vi.mock("@/lib/infra/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/infra/rate-limit")>();
  return { ...actual, consume: mockConsume };
});

vi.mock("@/lib/ai/ai", () => ({
  // The divine-name review fails closed, so its prompt is answered by its own
  // mock (default: approve) and generation call counts stay exact.
  callAI: (prompt: string, opts?: unknown) =>
    prompt.includes("reviewing content that another scholar wrote about a divine name")
      ? mockVerifyAI(prompt, opts)
      : mockCallAI(prompt, opts),
  resolveProvider: vi.fn(async () => "claude" as const),
  resolveModel: vi.fn(async () => "claude-opus-4-7"),
  defaultModelFor: () => "claude-opus-4-7",
}));

import { GET as getReflection, REFLECTION_VERSION } from "@/app/api/names/[slug]/reflection/route";
import { GET as getPairings, PAIRINGS_VERSION } from "@/app/api/names/[slug]/pairings/route";
import { approveNameVerification } from "../test-utils/name-verification";
import { GET as getVerses, VERSES_VERSION } from "@/app/api/names/[slug]/verses/route";

// Stub fetch AFTER static imports so vi.stubGlobal wins over any fetch patch
// applied during next/server module initialization.
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Plausible Arabic containing the name under test (ar-rahman): the AI-fallback
// verse selection requires the name to appear in the verse text.
const ARABIC_WITH_NAME = "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ";

function req(slug: string, path: string) {
  return new NextRequest(`http://localhost/api/names/${slug}/${path}`);
}
function params(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

const ROUTES: Array<{
  label: string;
  version: number;
  call: (slug: string) => Promise<Response>;
}> = [
  {
    label: "reflection",
    version: REFLECTION_VERSION,
    call: (slug) => getReflection(req(slug, "reflection"), params(slug)),
  },
  {
    label: "pairings",
    version: PAIRINGS_VERSION,
    call: (slug) => getPairings(req(slug, "pairings"), params(slug)),
  },
  {
    label: "verses",
    version: VERSES_VERSION,
    call: (slug) => getVerses(req(slug, "verses"), params(slug)),
  },
];

describe("names AI routes — per-client rate limiting", () => {
  beforeEach(() => {
    mockSelect.mockReset();
    mockConsume.mockReset();
    mockCallAI.mockReset();
    mockVerifyAI
      .mockReset()
      .mockImplementation(async (prompt: string) => approveNameVerification(prompt));
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({ ok: false });
    mockCookies.mockReset().mockResolvedValue({ get: () => undefined }); // "en" default
  });

  for (const { label, version, call } of ROUTES) {
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
      // version must match the route's current VERSION const to count as a hit
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
        return { ok: true, json: async () => ({ data: { text: ARABIC_WITH_NAME } }) };
      return { ok: false };
    });

    const res = await getVerses(req("ar-rahman", "verses"), params("ar-rahman"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(mockConsume).toHaveBeenCalledTimes(1);
    expect(mockCallAI).toHaveBeenCalled();
  });

  it("verses: a non-English locale with multiple uncached verse translations still consumes the rate limit exactly once", async () => {
    mockCookies.mockResolvedValue({
      get: (name: string) => (name === "oh_locale" ? { value: "tr" } : undefined),
    });
    mockSelect.mockReturnValue(makeSelectChain([])); // every select is a miss (verses + all translations)
    mockConsume.mockResolvedValue(true);
    // The two translation calls run concurrently (Promise.all), so they can
    // reach mockCallAI in either order — resolve based on prompt content
    // (each translateReason call embeds its own verse's source text) rather
    // than call order, which a sequential mockResolvedValueOnce chain can't
    // guarantee under concurrency.
    mockCallAI.mockImplementation(async (prompt: string) => {
      if (prompt.includes("Ayat al-Kursi.")) return "Ayet el-Kürsi (tr).";
      if (prompt.includes("Pure tawhid.")) return "Saf tevhid (tr).";
      return JSON.stringify([
        { ref: "2:255", reason: "Ayat al-Kursi." },
        { ref: "112:1", reason: "Pure tawhid." },
      ]);
    });
    mockFetch.mockImplementation(async (url: unknown) => {
      if (typeof url !== "string") return { ok: false };
      if (url.includes("api.alquran.cloud"))
        return { ok: true, json: async () => ({ data: { text: ARABIC_WITH_NAME } }) };
      return { ok: false };
    });

    const res = await getVerses(req("ar-rahman", "verses"), params("ar-rahman"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body.map((v: { reason: string }) => v.reason)).toEqual([
      "Ayet el-Kürsi (tr).",
      "Saf tevhid (tr).",
    ]);
    // At most 2 charges total (one for the canonical verse-selection miss,
    // one shared across the whole translation batch) — never one per verse.
    expect(mockConsume).toHaveBeenCalledTimes(2);
  });
});
