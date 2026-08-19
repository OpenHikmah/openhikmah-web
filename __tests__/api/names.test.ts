import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mocks must be declared before static imports so Vitest hoists them first
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}));

// The routes now call getUiLocale()/getQuranEdition() (lib/i18n/request-prefs.ts),
// which read next/headers' cookies() — unavailable outside a real Next request
// scope. Mock the module directly (same pattern as __tests__/api/search.test.ts)
// so individual tests can override the locale/edition; the defaults below match
// this suite's pre-existing English-only fixtures/assertions.
const { mockGetUiLocale, mockGetQuranEdition } = vi.hoisted(() => ({
  mockGetUiLocale: vi.fn(async (): Promise<"en" | "tr" | "ru" | "az"> => "en"),
  mockGetQuranEdition: vi.fn(async () => "en.sahih"),
}));
vi.mock("@/lib/i18n/request-prefs", () => ({
  getUiLocale: mockGetUiLocale,
  getQuranEdition: mockGetQuranEdition,
}));

// The name routes now read/write a durable `name_content` cache via lib/infra/db
// (see lib/names/name-content.ts). Mock the DB so the cache check is always a miss and
// the persist is a no-op — the routes then exercise their real generation path.
function makeDbChain(resolveWith: unknown[] = []) {
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
vi.mock("@/lib/infra/db", () => ({
  db: {
    select: () => makeDbChain([]), // cache miss
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: async () => undefined,
        onConflictDoNothing: () => ({ returning: async () => [{ reason: "unused" }] }),
      }),
    }),
  },
}));

// Shared (not per-instance) so tests can inspect every prompt sent to the AI
// across the module's several `new Anthropic()` call sites (callAI creates a
// fresh client per call).
const { mockCreate } = vi.hoisted(() => ({
  mockCreate: vi.fn(async (_args: { messages: Array<{ content: string }> }) => ({
    content: [
      {
        type: "text",
        text: JSON.stringify([
          { ref: "2:255", reason: "Verse of the Throne manifests Al-Hayy and Al-Qayyum." },
          { ref: "3:18", reason: "Allah witnesses His own oneness." },
          { ref: "59:22", reason: "Enumerates divine attributes directly." },
          { ref: "112:1", reason: "Al-Ahad — pure singularity." },
          { ref: "24:35", reason: "The Light verse expresses An-Nur." },
        ]),
      },
    ],
  })),
}));

vi.mock("@anthropic-ai/sdk", () => {
  class MockAnthropic {
    messages = { create: mockCreate };
  }

  return { default: MockAnthropic };
});

// Static imports — must come after vi.mock declarations so mocks are active
import { GET as getAllNames } from "@/app/api/names/route";
import { GET as getNameVerses } from "@/app/api/names/[slug]/verses/route";
import { TANZIH_CONSTRAINT } from "@/lib/ai/theological-constraints";

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
  beforeEach(() => {
    mockFetch.mockReset();
    mockGetUiLocale.mockReset();
    mockGetUiLocale.mockResolvedValue("en");
    mockGetQuranEdition.mockReset();
    mockGetQuranEdition.mockResolvedValue("en.sahih");
  });

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

  it("quran.com search fetch passes an abort signal so a hung upstream fails fast", async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (typeof url !== "string") return { ok: false };
      if (url.includes("ar.alafasy")) return arabicResp();
      if (url.includes("en.sahih")) return transResp();
      return { ok: false };
    });

    const req = new NextRequest("http://localhost/api/names/ar-rahman/verses");
    await getNameVerses(req, params("ar-rahman"));

    const searchCall = mockFetch.mock.calls.find(
      ([url]) => new URL(String(url)).hostname === "api.quran.com"
    );
    expect(searchCall).toBeDefined();
    expect(searchCall?.[1]).toEqual(expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it("hydrates verse translation for the requester's edition, not the en.sahih the selection was cached with", async () => {
    mockGetQuranEdition.mockResolvedValue("tr.diyanet");
    mockFetch.mockImplementation(async (url: string) => {
      if (typeof url !== "string") return { ok: false };
      if (url.includes("ar.alafasy")) return arabicResp();
      if (url.includes("tr.diyanet")) return transResp("Türkçe çeviri");
      if (url.includes("en.sahih")) return transResp("English translation");
      return { ok: false };
    });

    const req = new NextRequest("http://localhost/api/names/al-alim/verses");
    const res = await getNameVerses(req, params("al-alim"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.length).toBeGreaterThan(0);
    for (const verse of body) {
      expect(verse.translation).toBe("Türkçe çeviri");
    }
  });

  it("translateReason's prompt carries the shared TANZIH_CONSTRAINT text, not a hardcoded duplicate", async () => {
    mockGetUiLocale.mockResolvedValue("tr");
    mockGetQuranEdition.mockResolvedValue("tr.diyanet");
    mockFetch.mockImplementation(async (url: string) => {
      if (typeof url !== "string") return { ok: false };
      if (url.includes("ar.alafasy")) return arabicResp();
      if (url.includes("tr.diyanet")) return transResp("Türkçe çeviri");
      if (url.includes("en.sahih")) return transResp("English translation");
      return { ok: false };
    });
    mockCreate.mockClear();

    const req = new NextRequest("http://localhost/api/names/as-salam/verses");
    const res = await getNameVerses(req, params("as-salam"));
    expect(res.status).toBe(200);

    const translationPrompts = mockCreate.mock.calls
      .map(([arg]) => arg.messages[0].content as string)
      .filter((prompt: string) => prompt.startsWith("Translate the following sentence"));
    expect(translationPrompts.length).toBeGreaterThan(0);
    for (const prompt of translationPrompts) {
      expect(prompt).toContain(TANZIH_CONSTRAINT);
    }
  });
});
