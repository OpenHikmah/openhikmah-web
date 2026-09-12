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
  // The routes now call getUiLocale() (lib/i18n/request-prefs.ts), which reads
  // next/headers' cookies() — unavailable outside a real Next request scope.
  // Defaults to no cookie set (→ "en"); individual tests can override.
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

import { GET as getPairings } from "@/app/api/names/[slug]/pairings/route";
import { GET as getVerses } from "@/app/api/names/[slug]/verses/route";
import { GET as getReflection } from "@/app/api/names/[slug]/reflection/route";

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
    mockCookies.mockReset().mockResolvedValue({ get: () => undefined }); // "en" default
  });

  function withLocale(locale: string) {
    mockCookies.mockResolvedValue({
      get: (name: string) => (name === "oh_locale" ? { value: locale } : undefined),
    });
  }

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
          // Exact DIVINE_NAMES values so it resolves to one of the 99.
          transliteration: "Ar-Rahīm",
          arabic: "الرَّحِيم",
          explanation: "Balances universal grace with mercy specific to the believers.",
        },
        { transliteration: 42, arabic: null },
        "junk",
      ])
    );

    const res = await getPairings(req("ar-rahman", "pairings"), params("ar-rahman"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({ name: "ar-rahim", transliteration: "Ar-Rahīm" });
  });

  it("pairings: a shape-valid entry whose name doesn't resolve to one of the 99 is dropped", async () => {
    mockCallAI.mockResolvedValue(
      JSON.stringify([
        {
          transliteration: "Ar-Rahīm",
          arabic: "الرَّحِيم",
          explanation: "Resolves — kept.",
        },
        {
          transliteration: "Al-Fictitious",
          arabic: "لا شيء",
          explanation: 'Not one of the 99 — must be dropped, never cached with name: "".',
        },
      ])
    );

    const res = await getPairings(req("ar-rahman", "pairings"), params("ar-rahman"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.map((p: { transliteration: string }) => p.transliteration)).toEqual(["Ar-Rahīm"]);
    expect(body.every((p: { name: string }) => p.name.length > 0)).toBe(true);
  });

  it("reflection: a model refusal is not cached — returns 200 with empty content", async () => {
    mockCallAI.mockResolvedValue("I'm sorry, but I can't help with religious interpretation.");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await getReflection(req("ar-rahman", "reflection"), params("ar-rahman"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ reflection: "" });
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("returned a refusal"));
    errorSpy.mockRestore();
  });

  it("pairings: a model refusal is not cached — returns 200 with an empty array", async () => {
    mockCallAI.mockResolvedValue("As an AI, I cannot produce this content.");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await getPairings(req("ar-rahman", "pairings"), params("ar-rahman"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("returned a refusal"));
    errorSpy.mockRestore();
  });

  it("verses: a model refusal in the AI-fallback path is not cached and does not retry against Gemini", async () => {
    mockCallAI.mockResolvedValue("I'm sorry, but I can't help with religious interpretation.");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await getVerses(req("ar-rahman", "verses"), params("ar-rahman"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("returned a refusal"));
    // A refusal must not be silently backed by a different provider — only
    // the one (refused) call happens, no Gemini fallback attempt.
    expect(mockCallAI).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });

  it("verses: AI fallback refs outside real Quran bounds are dropped (no 500)", async () => {
    mockCallAI.mockResolvedValue(
      JSON.stringify([
        { ref: "2:300", reason: "out-of-range ayah" },
        { ref: "999:1", reason: "out-of-range surah" },
        { ref: "1:8", reason: "past Al-Fatihah's 7 ayahs (per-surah bound)" },
        { ref: "50:46", reason: "past Qaf's 45 ayahs (per-surah bound)" },
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
    const ARABIC = "اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ";
    const ENGLISH = "Allah - there is no deity except Him, the Ever-Living.";
    mockFetch.mockImplementation(async (url: unknown) => {
      if (typeof url !== "string") return { ok: false };
      // Distinct per-edition payloads so a swapped translation source is caught.
      if (url.includes("ar.alafasy"))
        return { ok: true, json: async () => ({ data: { text: ARABIC } }) };
      if (url.includes("en.sahih"))
        return { ok: true, json: async () => ({ data: { text: ENGLISH } }) };
      return { ok: false };
    });

    const res = await getVerses(req("ar-rahman", "verses"), params("ar-rahman"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].ref).toBe("2:255");
    expect(body[0].reason).toBe("Ayat al-Kursi.");
    expect(body[0].arabicText).toBe(ARABIC);
    expect(body[0].translation).toBe(ENGLISH);
  });

  it("verses: the AI-fallback prompt includes the Tanzih constraint", async () => {
    mockCallAI.mockResolvedValue(JSON.stringify([{ ref: "2:255", reason: "Ayat al-Kursi." }]));
    await getVerses(req("ar-rahman", "verses"), params("ar-rahman"));
    expect(mockCallAI).toHaveBeenCalled();
    const prompt = mockCallAI.mock.calls[0][0] as string;
    expect(prompt).toMatch(/strict tanzih/i);
  });

  it("reflection: an AI provider failure returns 200 with empty content, not a 500, and logs it", async () => {
    mockCallAI.mockRejectedValue(new Error("Your credit balance is too low to access the API."));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await getReflection(req("ar-rahman", "reflection"), params("ar-rahman"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ reflection: "" });
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Reflection: AI call failed"),
      expect.any(Error)
    );
    errorSpy.mockRestore();
  });

  it("pairings: an AI provider failure returns 200 with an empty array, not a 500, and logs it", async () => {
    mockCallAI.mockRejectedValue(new Error("Your credit balance is too low to access the API."));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await getPairings(req("ar-rahman", "pairings"), params("ar-rahman"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Pairings: AI call failed"),
      expect.any(Error)
    );
    errorSpy.mockRestore();
  });

  it("reflection: no language directive for the default (English) locale", async () => {
    mockCallAI.mockResolvedValue("A reflection paragraph.");
    await getReflection(req("ar-rahman", "reflection"), params("ar-rahman"));
    const prompt = mockCallAI.mock.calls[0][0] as string;
    expect(prompt).not.toMatch(/write the reflection in/i);
    expect(prompt).toMatch(/strict tanzih/i);
  });

  it("reflection: appends a language directive for a non-English locale, keeping Tanzih rules", async () => {
    withLocale("tr");
    mockCallAI.mockResolvedValue("Bir yansıma paragrafı.");
    await getReflection(req("ar-rahman", "reflection"), params("ar-rahman"));
    const prompt = mockCallAI.mock.calls[0][0] as string;
    expect(prompt).toMatch(/write the reflection in turkish/i);
    expect(prompt).toMatch(/strict tanzih/i);
  });

  it("pairings: no language directive for the default (English) locale", async () => {
    mockCallAI.mockResolvedValue(JSON.stringify([]));
    await getPairings(req("ar-rahman", "pairings"), params("ar-rahman"));
    const prompt = mockCallAI.mock.calls[0][0] as string;
    expect(prompt).not.toMatch(/write each "explanation" in/i);
  });

  it("pairings: appends a language directive for a non-English locale", async () => {
    withLocale("ru");
    mockCallAI.mockResolvedValue(JSON.stringify([]));
    await getPairings(req("ar-rahman", "pairings"), params("ar-rahman"));
    const prompt = mockCallAI.mock.calls[0][0] as string;
    expect(prompt).toMatch(/write each "explanation" in russian/i);
  });

  function mockVerseFetch() {
    mockFetch.mockImplementation(async (url: unknown) => {
      if (typeof url !== "string") return { ok: false };
      if (url.includes("ar.alafasy"))
        return {
          ok: true,
          json: async () => ({ data: { text: "اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ" } }),
        };
      if (url.includes("en.sahih"))
        return { ok: true, json: async () => ({ data: { text: "English text" } }) };
      return { ok: false };
    });
  }

  it("verses: selection stays English-only and untranslated for the default locale", async () => {
    mockVerseFetch();
    mockCallAI.mockResolvedValue(JSON.stringify([{ ref: "2:255", reason: "Ayat al-Kursi." }]));
    const res = await getVerses(req("ar-rahman", "verses"), params("ar-rahman"));
    const body = await res.json();
    expect(body[0].reason).toBe("Ayat al-Kursi.");
    expect(mockCallAI).toHaveBeenCalledTimes(1); // only the fallback-verses call, no translation pass
  });

  it("verses: translates only the reason for a non-English locale, leaving the verse selection unchanged", async () => {
    withLocale("az");
    mockVerseFetch();
    mockCallAI
      .mockResolvedValueOnce(JSON.stringify([{ ref: "2:255", reason: "Ayat al-Kursi." }]))
      .mockResolvedValueOnce("Ayat əl-Kürsi.");

    const res = await getVerses(req("ar-rahman", "verses"), params("ar-rahman"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].ref).toBe("2:255"); // selection unchanged
    expect(body[0].reason).toBe("Ayat əl-Kürsi."); // reason translated
    expect(mockCallAI).toHaveBeenCalledTimes(2);
    const translatePrompt = mockCallAI.mock.calls[1][0] as string;
    expect(translatePrompt).toMatch(/translate the following sentence into azerbaijani/i);
    expect(translatePrompt).toMatch(/strict tanzih/i);
  });

  it("verses: an empty/failed translation falls back to the canonical English reason instead of blanking it", async () => {
    withLocale("az");
    mockVerseFetch();
    mockCallAI
      .mockResolvedValueOnce(JSON.stringify([{ ref: "2:255", reason: "Ayat al-Kursi." }]))
      .mockResolvedValueOnce(""); // translation call returns nothing

    const res = await getVerses(req("ar-rahman", "verses"), params("ar-rahman"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body[0].reason).toBe("Ayat al-Kursi."); // canonical reason preserved, not blanked
  });

  it("verses: a non-empty but junk translation (model refusal) also falls back to the English reason, without retrying against Gemini", async () => {
    withLocale("az");
    mockVerseFetch();
    mockCallAI
      .mockResolvedValueOnce(JSON.stringify([{ ref: "2:255", reason: "Ayat al-Kursi." }]))
      .mockResolvedValueOnce("I'm sorry, but I can't help with translating religious content.");

    const res = await getVerses(req("ar-rahman", "verses"), params("ar-rahman"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body[0].reason).toBe("Ayat al-Kursi.");
    // fallback-verses selection + the one (refused) translation call — a
    // refusal on translation must not be silently backed by Gemini either.
    expect(mockCallAI).toHaveBeenCalledTimes(2);
  });

  it("verses: a model refusal in the per-verse reason builder (search found results) leaves the default reason, without retrying against Gemini", async () => {
    mockFetch.mockImplementation(async (url: unknown) => {
      if (typeof url !== "string") return { ok: false };
      if (url.includes("api.quran.com/api/v4/search")) {
        return { ok: true, json: async () => ({ search: { results: [{ verse_key: "2:255" }] } }) };
      }
      if (url.includes("ar.alafasy"))
        return { ok: true, json: async () => ({ data: { text: "AR" } }) };
      if (url.includes("en.sahih"))
        return { ok: true, json: async () => ({ data: { text: "EN" } }) };
      return { ok: false };
    });
    mockCallAI.mockResolvedValue("I'm sorry, but I can't help with religious interpretation.");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await getVerses(req("ar-rahman", "verses"), params("ar-rahman"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].ref).toBe("2:255");
    expect(body[0].reason).toMatch(/^Contains a form of/); // buildReasons' refusal degrades to the default reason
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("returned a refusal"));
    // A refusal here only degrades the per-verse reason (search already found
    // the verse), so it doesn't gate the overall verses fallback — but it
    // still shouldn't itself retry the reason-builder call against Gemini.
    expect(mockCallAI).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });
});
