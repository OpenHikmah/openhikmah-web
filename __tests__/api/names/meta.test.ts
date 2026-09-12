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

const { mockConsume, mockCallAI, mockCookies } = vi.hoisted(() => ({
  mockConsume: vi.fn(),
  mockCallAI: vi.fn(),
  mockCookies: vi.fn(async () => ({
    get: (_name: string) => undefined as { value: string } | undefined,
  })),
}));

vi.mock("next/headers", () => ({ cookies: mockCookies }));

vi.mock("@/lib/infra/db", () => ({
  db: {
    select: () => makeSelectChain([]), // durable cache always misses
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: async () => undefined,
        onConflictDoNothing: () => ({ returning: async () => [{ reason: "unused" }] }),
      }),
    }),
  },
}));

vi.mock("@/lib/infra/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/infra/rate-limit")>();
  return { ...actual, consume: mockConsume };
});

vi.mock("@/lib/ai/ai", () => ({
  callAI: mockCallAI,
  resolveProvider: vi.fn(async () => "claude" as const),
  resolveModel: vi.fn(async () => "claude-opus-4-7"),
  defaultModelFor: () => "claude-opus-4-7",
}));

import { GET as getMeta } from "@/app/api/names/[slug]/meta/route";

function req(slug: string) {
  return new NextRequest(`http://localhost/api/names/${slug}/meta`);
}
function params(slug: string) {
  return { params: Promise.resolve({ slug }) };
}
function withLocale(locale: string) {
  mockCookies.mockResolvedValue({
    get: (name: string) => (name === "oh_locale" ? { value: locale } : undefined),
  });
}

describe("GET /api/names/[slug]/meta", () => {
  beforeEach(() => {
    mockConsume.mockReset().mockResolvedValue(true);
    mockCallAI.mockReset();
    mockCookies.mockReset().mockResolvedValue({ get: () => undefined }); // "en" default
  });

  it("returns 404 for an unknown slug", async () => {
    const res = await getMeta(req("not-a-name"), params("not-a-name"));
    expect(res.status).toBe(404);
  });

  it("returns the canonical English text untranslated, with no AI call", async () => {
    const res = await getMeta(req("al-malik"), params("al-malik"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.meaning).toBe("The Sovereign");
    expect(body.description).toMatch(/Absolute dominion/);
    expect(mockCallAI).not.toHaveBeenCalled();
  });

  // meaning and description translate concurrently (Promise.all in the route),
  // so which one reaches the mocked callAI first isn't guaranteed — key the
  // mock off which canonical sentence is being translated instead of call order.
  function mockTranslationsBySource(bySource: Record<string, string | Error>) {
    mockCallAI.mockImplementation(async (prompt: string) => {
      const match = Object.entries(bySource).find(([source]) => prompt.includes(source));
      if (!match) throw new Error(`unexpected prompt: ${prompt}`);
      const [, result] = match;
      if (result instanceof Error) throw result;
      return result;
    });
  }

  // translateReason's length-ratio guard (lib/ai/translate.ts) rejects a
  // translation whose length strays too far from the source's — the
  // description canonical text is long, so its mocked "translation" has to
  // be long enough too, or the guard (correctly) rejects it as junk.
  const TR_DESCRIPTION =
    "Var olan her şey üzerinde, hiçbir ortağı, öncülü veya sınırlaması olmaksızın mutlak bir egemenlik; bu hükümranlık yalnızca Zâtın kendisine aittir.";
  const RU_DESCRIPTION =
    "Абсолютное владычество над всем сущим, не имеющее ни партнёра, ни предшественника, ни ограничения — суверенитет, который принадлежит самой Сущности.";

  it("translates both fields for a non-English locale", async () => {
    withLocale("tr");
    mockTranslationsBySource({
      "The Sovereign": "Hükümdar",
      "Absolute dominion": TR_DESCRIPTION,
    });

    const res = await getMeta(req("al-malik"), params("al-malik"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.meaning).toBe("Hükümdar");
    expect(body.description).toBe(TR_DESCRIPTION);
    expect(mockCallAI).toHaveBeenCalledTimes(2);
  });

  it("falls back to the canonical English field when its translation call fails, without failing the request", async () => {
    withLocale("ru");
    mockTranslationsBySource({
      "The Sovereign": new Error("provider down"),
      "Absolute dominion": RU_DESCRIPTION,
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await getMeta(req("al-malik"), params("al-malik"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.meaning).toBe("The Sovereign"); // failed translation → English fallback
    expect(body.description).toBe(RU_DESCRIPTION);
    errorSpy.mockRestore();
  });

  it("falls back to English when the model returns a refusal, without a 500", async () => {
    withLocale("az");
    mockCallAI.mockResolvedValue("I'm sorry, but I can't help with translating religious content.");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await getMeta(req("al-malik"), params("al-malik"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.meaning).toBe("The Sovereign");
    expect(body.description).toMatch(/Absolute dominion/);
    errorSpy.mockRestore();
  });

  it("charges the rate limit once per request, not once per field", async () => {
    withLocale("tr");
    mockCallAI.mockResolvedValue("çeviri");
    await getMeta(req("al-malik"), params("al-malik"));
    const genCalls = mockConsume.mock.calls.filter(([key]) => String(key).startsWith("names-gen:"));
    expect(genCalls).toHaveLength(1);
  });

  it("never consumes the rate limit for the English locale (no AI call at all)", async () => {
    await getMeta(req("al-malik"), params("al-malik"));
    expect(mockConsume).not.toHaveBeenCalled();
  });

  it("returns 429 when the rate limit is exhausted", async () => {
    withLocale("tr");
    mockConsume.mockResolvedValue(false);
    const res = await getMeta(req("al-malik"), params("al-malik"));
    expect(res.status).toBe(429);
  });
});
