import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

const { mockConsume, mockCallAI, mockVerifyAI, mockCookies, mockInsertValues } = vi.hoisted(() => ({
  mockConsume: vi.fn(),
  mockInsertValues: vi.fn(),
  mockCallAI: vi.fn(),
  mockVerifyAI: vi.fn(),
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
      values: (row: unknown) => {
        mockInsertValues(row);
        return {
          onConflictDoUpdate: async () => undefined,
          onConflictDoNothing: () => ({ returning: async () => [{ reason: "unused" }] }),
        };
      },
    }),
  },
}));

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

import { GET as getPairings } from "@/app/api/names/[slug]/pairings/route";
import { approveNameVerification } from "../test-utils/name-verification";
import { GET as getVerses } from "@/app/api/names/[slug]/verses/route";
import { counterSnapshot } from "@/lib/infra/metrics";
import { TANZIH_CONSTRAINT } from "@/lib/ai/theological-constraints";
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
    mockVerifyAI
      .mockReset()
      .mockImplementation(async (prompt: string) => approveNameVerification(prompt));
    mockInsertValues.mockReset();
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
    const ARABIC = "هُوَ ٱلرَّحْمَٰنُ ٱلرَّحِيمُ ٱلْعَلِيمُ ٱلْقَدِيرُ";
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

  it("verses: an AI-fallback verse whose text does not contain the name is dropped", async () => {
    mockCallAI.mockResolvedValue(
      JSON.stringify([
        { ref: "2:255", reason: "Names the Ever-Living." },
        { ref: "112:1", reason: "Claims a relation the verse text does not support." },
      ])
    );
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const before = counterSnapshot()["names_rejected_root_mismatch"] ?? 0;
    mockFetch.mockImplementation(async (url: unknown) => {
      if (typeof url !== "string") return { ok: false };
      if (url.includes("ayah/2:255/ar.alafasy"))
        return { ok: true, json: async () => ({ data: { text: "هُوَ ٱلرَّحْمَٰنُ ٱلرَّحِيمُ" } }) };
      // 112:1 does not contain ar-rahman.
      if (url.includes("ar.alafasy"))
        return { ok: true, json: async () => ({ data: { text: "قُلْ هُوَ ٱللَّهُ أَحَدٌ" } }) };
      if (url.includes("en.sahih"))
        return { ok: true, json: async () => ({ data: { text: "English text." } }) };
      return { ok: false };
    });

    const res = await getVerses(req("ar-rahman", "verses"), params("ar-rahman"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.map((v: { ref: string }) => v.ref)).toEqual(["2:255"]);
    expect(counterSnapshot()["names_rejected_root_mismatch"]).toBe(before + 1);
    errSpy.mockRestore();
  });

  it("verses: when no AI-fallback verse contains the name the result is empty, so it is not cached", async () => {
    mockCallAI.mockResolvedValue(
      JSON.stringify([{ ref: "112:1", reason: "Claims a relation the text does not support." }])
    );
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetch.mockImplementation(async (url: unknown) => {
      if (typeof url !== "string") return { ok: false };
      if (url.includes("ar.alafasy"))
        return { ok: true, json: async () => ({ data: { text: "قُلْ هُوَ ٱللَّهُ أَحَدٌ" } }) };
      if (url.includes("en.sahih"))
        return { ok: true, json: async () => ({ data: { text: "English text." } }) };
      return { ok: false };
    });

    const res = await getVerses(req("ar-rahman", "verses"), params("ar-rahman"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
    errSpy.mockRestore();
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

  it("reflection: the default (English) locale generates once, with no translation pass", async () => {
    mockCallAI.mockResolvedValue("A reflection paragraph.");
    await getReflection(req("ar-rahman", "reflection"), params("ar-rahman"));
    expect(mockCallAI).toHaveBeenCalledTimes(1);
    const prompt = mockCallAI.mock.calls[0][0] as string;
    expect(prompt).toMatch(/strict tanzih/i);
  });

  // Issue #649: containsTashbih() is English-only, so non-English content must
  // be generated (and scanned) in English first, then translated.
  it("reflection: a non-English locale generates in English, then translates the scanned text", async () => {
    withLocale("tr");
    mockCallAI
      .mockResolvedValueOnce("The believer strives in lawful means and trusts Allah alone.")
      .mockResolvedValueOnce("Mümin helal yollarla çalışır ve yalnızca Allah'a güvenir.");

    const res = await getReflection(req("ar-rahman", "reflection"), params("ar-rahman"));

    expect(await res.json()).toEqual({
      reflection: "Mümin helal yollarla çalışır ve yalnızca Allah'a güvenir.",
    });
    expect(mockCallAI).toHaveBeenCalledTimes(2);
    const generatePrompt = mockCallAI.mock.calls[0][0] as string;
    expect(generatePrompt).not.toMatch(/turkish/i);
    expect(generatePrompt).toMatch(/strict tanzih/i);
    const translatePrompt = mockCallAI.mock.calls[1][0] as string;
    expect(translatePrompt).toMatch(/translate the following sentence into turkish/i);
    expect(translatePrompt).toContain("trusts Allah alone");
    expect(mockConsume).toHaveBeenCalledTimes(1);
  });

  it("reflection: a Tashbih-phrased English source is never translated for a non-English locale", async () => {
    withLocale("ru");
    mockCallAI.mockResolvedValue("This shows God literally has a physical body.");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await getReflection(req("ar-rahman", "reflection"), params("ar-rahman"));

    expect(await res.json()).toEqual({ reflection: "" });
    // Claude + the Gemini retry, both rejected — no translation call follows.
    expect(mockCallAI).toHaveBeenCalledTimes(2);
    for (const [prompt] of mockCallAI.mock.calls) {
      expect(prompt).not.toMatch(/translate the following/i);
    }
    errorSpy.mockRestore();
  });

  it("reflection: a refused translation serves the English reflection, without retrying against Gemini", async () => {
    withLocale("az");
    mockCallAI
      .mockResolvedValueOnce("The believer strives in lawful means and trusts Allah alone.")
      .mockResolvedValueOnce("I'm sorry, but I can't help with translating religious content.");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await getReflection(req("ar-rahman", "reflection"), params("ar-rahman"));

    expect(await res.json()).toEqual({
      reflection: "The believer strives in lawful means and trusts Allah alone.",
    });
    expect(mockCallAI).toHaveBeenCalledTimes(2);
    errorSpy.mockRestore();
  });

  it("pairings: the default (English) locale generates once, with no translation pass", async () => {
    mockCallAI.mockResolvedValue(JSON.stringify([]));
    await getPairings(req("ar-rahman", "pairings"), params("ar-rahman"));
    const prompt = mockCallAI.mock.calls[0][0] as string;
    expect(prompt).not.toMatch(/translate the following/i);
  });

  const EN_PAIRINGS = JSON.stringify([
    {
      transliteration: "Ar-Rahīm",
      arabic: "الرَّحِيم",
      explanation: "Balances universal grace with mercy specific to the believers.",
    },
    {
      transliteration: "Al-Malik",
      arabic: "الْمَلِك",
      explanation: "Joins His mercy to His absolute sovereignty over creation.",
    },
  ]);

  it("pairings: a non-English locale generates in English, then translates only the explanations", async () => {
    withLocale("ru");
    mockCallAI.mockImplementation(async (prompt: string) => {
      if (prompt.includes("universal grace"))
        return "Уравновешивает всеобщую милость особой милостью к верующим.";
      if (prompt.includes("absolute sovereignty"))
        return "Соединяет Его милость с Его абсолютной властью над творением.";
      return EN_PAIRINGS;
    });

    const res = await getPairings(req("ar-rahman", "pairings"), params("ar-rahman"));

    const body = await res.json();
    expect(body).toEqual([
      {
        name: "ar-rahim",
        transliteration: "Ar-Rahīm",
        arabic: "الرَّحِيم",
        explanation: "Уравновешивает всеобщую милость особой милостью к верующим.",
      },
      {
        name: "al-malik",
        transliteration: "Al-Malik",
        arabic: "الْمَلِك",
        explanation: "Соединяет Его милость с Его абсолютной властью над творением.",
      },
    ]);
    const generatePrompt = mockCallAI.mock.calls[0][0] as string;
    expect(generatePrompt).not.toMatch(/russian/i);
    expect(mockCallAI).toHaveBeenCalledTimes(3);
    expect(mockConsume).toHaveBeenCalledTimes(1);
  });

  it("pairings: an incomplete translation set serves English rather than a half-translated list", async () => {
    withLocale("tr");
    mockCallAI.mockImplementation(async (prompt: string) => {
      if (prompt.includes("universal grace"))
        return "İnananlara özel rahmetle evrensel lütfu dengeler.";
      if (prompt.includes("absolute sovereignty")) return "";
      return EN_PAIRINGS;
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await getPairings(req("ar-rahman", "pairings"), params("ar-rahman"));

    const body = await res.json();
    expect(body.map((p: { explanation: string }) => p.explanation)).toEqual([
      "Balances universal grace with mercy specific to the believers.",
      "Joins His mercy to His absolute sovereignty over creation.",
    ]);
    errorSpy.mockRestore();
  });

  function mockVerseFetch() {
    mockFetch.mockImplementation(async (url: unknown) => {
      if (typeof url !== "string") return { ok: false };
      if (url.includes("ar.alafasy"))
        return {
          ok: true,
          json: async () => ({
            data: { text: "هُوَ ٱلرَّحْمَٰنُ ٱلرَّحِيمُ ٱلْعَلِيمُ ٱلْقَدِيرُ" },
          }),
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
        return {
          ok: true,
          json: async () => ({
            data: { text: "هُوَ ٱلرَّحْمَٰنُ ٱلرَّحِيمُ ٱلْعَلِيمُ ٱلْقَدِيرُ" },
          }),
        };
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
  it("reflection: Tashbih phrasing is rejected (not cached) and retried against Gemini", async () => {
    mockCallAI.mockResolvedValue("This shows God literally has a physical body.");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await getReflection(req("ar-rahman", "reflection"), params("ar-rahman"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ reflection: "" });
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Tashbih phrasing"));
    // Unlike a refusal, a Tashbih hit is a bad answer, so the Gemini retry runs.
    expect(mockCallAI).toHaveBeenCalledTimes(2);
    errorSpy.mockRestore();
  });

  describe("second-pass review of generated names content", () => {
    const GOOD_REFLECTION = "A reflection on mercy that stays within divine transcendence.";
    const GOOD_PAIRINGS = JSON.stringify([
      {
        transliteration: "Ar-Rahim",
        arabic: "الرَّحِيم",
        explanation: "Balances mercy in general and in specific senses.",
      },
      {
        transliteration: "Al-Malik",
        arabic: "الْمَلِك",
        explanation: "Pairs mercy with sovereignty, as classical tafsir notes.",
      },
    ]);

    it("reflection: an approved reflection is cached and served; the reviewer is asked once", async () => {
      mockCallAI.mockResolvedValue(GOOD_REFLECTION);
      const res = await getReflection(req("ar-rahman", "reflection"), params("ar-rahman"));
      expect(await res.json()).toEqual({ reflection: GOOD_REFLECTION });
      expect(mockVerifyAI).toHaveBeenCalledTimes(1);
      const prompt = mockVerifyAI.mock.calls[0][0] as string;
      expect(prompt).toContain(GOOD_REFLECTION);
      expect(prompt).toContain(TANZIH_CONSTRAINT);
    });

    it("reflection: a rejected reflection is empty and not cached, and a Gemini retry is allowed", async () => {
      mockCallAI.mockResolvedValue(GOOD_REFLECTION);
      mockVerifyAI.mockResolvedValue(JSON.stringify({ valid: false }));
      const res = await getReflection(req("ar-rahman", "reflection"), params("ar-rahman"));
      expect(await res.json()).toEqual({ reflection: "" });
      expect(mockInsertValues).not.toHaveBeenCalled();
      // A rejection is a bad answer, not a refusal: the retry runs (generation + review again).
      expect(mockCallAI).toHaveBeenCalledTimes(2);
      expect(mockVerifyAI).toHaveBeenCalledTimes(2);
    });

    it.each([
      ["unparseable", "I cannot tell."],
      ["no explicit approval", JSON.stringify({ comment: "fine" })],
    ])("reflection: a reviewer reply with %s is not an approval", async (_label, reply) => {
      mockCallAI.mockResolvedValue(GOOD_REFLECTION);
      mockVerifyAI.mockResolvedValue(reply);
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const res = await getReflection(req("ar-rahman", "reflection"), params("ar-rahman"));
      expect(await res.json()).toEqual({ reflection: "" });
      expect(mockInsertValues).not.toHaveBeenCalled();
      errSpy.mockRestore();
    });

    it("reflection: a reviewer error fails closed (empty, not cached)", async () => {
      mockCallAI.mockResolvedValue(GOOD_REFLECTION);
      mockVerifyAI.mockRejectedValue(new Error("503 reviewer unavailable"));
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const res = await getReflection(req("ar-rahman", "reflection"), params("ar-rahman"));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ reflection: "" });
      expect(mockInsertValues).not.toHaveBeenCalled();
      errSpy.mockRestore();
    });

    it("reflection: a reviewer refusal is not retried against Gemini", async () => {
      mockCallAI.mockResolvedValue(GOOD_REFLECTION);
      mockVerifyAI.mockResolvedValue("I'm sorry, but I can't help with that.");
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const res = await getReflection(req("ar-rahman", "reflection"), params("ar-rahman"));
      expect(await res.json()).toEqual({ reflection: "" });
      expect(mockCallAI).toHaveBeenCalledTimes(1);
      expect(mockInsertValues).not.toHaveBeenCalled();
      errSpy.mockRestore();
    });

    it("pairings: only explicitly approved pairings are cached and served", async () => {
      mockCallAI.mockResolvedValue(GOOD_PAIRINGS);
      mockVerifyAI.mockResolvedValue(
        JSON.stringify([
          { name: "ar-rahim", valid: true },
          { name: "al-malik", valid: false },
        ])
      );
      const res = await getPairings(req("ar-rahman", "pairings"), params("ar-rahman"));
      const body = await res.json();
      expect(body.map((p: { name: string }) => p.name)).toEqual(["ar-rahim"]);
    });

    it("pairings: a pairing the reviewer does not mention is dropped", async () => {
      mockCallAI.mockResolvedValue(GOOD_PAIRINGS);
      mockVerifyAI.mockResolvedValue(JSON.stringify([{ name: "al-malik", valid: true }]));
      const res = await getPairings(req("ar-rahman", "pairings"), params("ar-rahman"));
      const body = await res.json();
      expect(body.map((p: { name: string }) => p.name)).toEqual(["al-malik"]);
    });

    it("pairings: a reviewer error fails closed (empty, not cached)", async () => {
      mockCallAI.mockResolvedValue(GOOD_PAIRINGS);
      mockVerifyAI.mockRejectedValue(new Error("503 reviewer unavailable"));
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const res = await getPairings(req("ar-rahman", "pairings"), params("ar-rahman"));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([]);
      expect(mockInsertValues).not.toHaveBeenCalled();
      errSpy.mockRestore();
    });
  });

  it("pairings: a Tashbih-phrased explanation is dropped, clean ones kept", async () => {
    mockCallAI.mockResolvedValue(
      JSON.stringify([
        {
          transliteration: "Ar-Rahīm",
          arabic: "الرَّحِيم",
          explanation: "Balances universal grace with mercy specific to the believers.",
        },
        {
          transliteration: "Al-Malik",
          arabic: "الْمَلِك",
          explanation: "This shows God literally has a physical body.",
        },
      ])
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await getPairings(req("ar-rahman", "pairings"), params("ar-rahman"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.map((p: { transliteration: string }) => p.transliteration)).toEqual(["Ar-Rahīm"]);
    errorSpy.mockRestore();
  });

  it("verses: a Tashbih-phrased AI-fallback reason drops that verse", async () => {
    mockCallAI.mockResolvedValue(
      JSON.stringify([{ ref: "2:255", reason: "This shows God literally has a physical body." }])
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await getVerses(req("ar-rahman", "verses"), params("ar-rahman"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Tashbih-phrased"));
    errorSpy.mockRestore();
  });

  it("verses: a Tashbih-phrased per-verse reason falls back to the default reason", async () => {
    mockFetch.mockImplementation(async (url: unknown) => {
      if (typeof url !== "string") return { ok: false };
      if (url.includes("api.quran.com/api/v4/search")) {
        return { ok: true, json: async () => ({ search: { results: [{ verse_key: "2:255" }] } }) };
      }
      if (url.includes("ar.alafasy"))
        return {
          ok: true,
          json: async () => ({
            data: { text: "هُوَ ٱلرَّحْمَٰنُ ٱلرَّحِيمُ ٱلْعَلِيمُ ٱلْقَدِيرُ" },
          }),
        };
      if (url.includes("en.sahih"))
        return {
          ok: true,
          json: async () => ({ data: { text: "Allah - there is no deity except Him." } }),
        };
      return { ok: false };
    });
    mockCallAI.mockResolvedValue(
      JSON.stringify({ "2:255": "This shows God literally has a physical body." })
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await getVerses(req("ar-rahman", "verses"), params("ar-rahman"));

    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].reason).toMatch(/^Contains a form of/);
    errorSpy.mockRestore();
  });
  describe("verses: a failed reason call is never cached (issue #665)", () => {
    function mockSearchFetch(refs: string[]) {
      mockFetch.mockImplementation(async (url: unknown) => {
        if (typeof url !== "string") return { ok: false };
        if (url.includes("api.quran.com/api/v4/search")) {
          return {
            ok: true,
            json: async () => ({ search: { results: refs.map((verse_key) => ({ verse_key })) } }),
          };
        }
        if (url.includes("ar.alafasy"))
          return {
            ok: true,
            json: async () => ({
              data: { text: "هُوَ ٱلرَّحْمَٰنُ ٱلرَّحِيمُ ٱلْعَلِيمُ ٱلْقَدِيرُ" },
            }),
          };
        if (url.includes("en.sahih"))
          return {
            ok: true,
            json: async () => ({ data: { text: "Allah - there is no deity except Him." } }),
          };
        return { ok: false };
      });
    }

    const versesCacheWrites = () =>
      mockInsertValues.mock.calls.filter(([row]) => (row as { kind?: string }).kind === "verses");
    const reasonCacheWrites = () =>
      mockInsertValues.mock.calls.filter(([row]) => "reason" in (row as object));

    let errorSpy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    });
    afterEach(() => {
      errorSpy.mockRestore();
    });

    it("a refusal serves default reasons, caches nothing, and the next request retries", async () => {
      mockSearchFetch(["2:255", "1:1"]);
      mockCallAI.mockResolvedValue("I'm sorry, but I can't help with religious interpretation.");

      const res = await getVerses(req("ar-rahman", "verses"), params("ar-rahman"));

      const body = await res.json();
      expect(body).toHaveLength(2);
      expect(body.every((v: { reason: string }) => /^Contains a form of/.test(v.reason))).toBe(
        true
      );
      expect(versesCacheWrites()).toHaveLength(0);
      expect(mockCallAI).toHaveBeenCalledTimes(1); // refusal is not backed by Gemini

      await getVerses(req("ar-rahman", "verses"), params("ar-rahman"));
      expect(mockCallAI).toHaveBeenCalledTimes(2); // retried, not served from a placeholder cache
    });

    it("unparsable reason output is not cached", async () => {
      mockSearchFetch(["2:255"]);
      mockCallAI.mockResolvedValue("not json at all");

      const res = await getVerses(req("ar-rahman", "verses"), params("ar-rahman"));

      expect(res.status).toBe(200);
      expect((await res.json())[0].reason).toMatch(/^Contains a form of/);
      expect(versesCacheWrites()).toHaveLength(0);
    });

    it("a thrown reason call is not cached", async () => {
      mockSearchFetch(["2:255"]);
      mockCallAI.mockRejectedValue(new Error("provider down"));

      const res = await getVerses(req("ar-rahman", "verses"), params("ar-rahman"));

      expect(res.status).toBe(200);
      expect((await res.json())[0].reason).toMatch(/^Contains a form of/);
      expect(versesCacheWrites()).toHaveLength(0);
    });

    it("a reason map missing only some refs is still cached", async () => {
      mockSearchFetch(["2:255", "1:1"]);
      mockCallAI.mockResolvedValue(JSON.stringify({ "2:255": "Ayat al-Kursi affirms His mercy." }));

      const res = await getVerses(req("ar-rahman", "verses"), params("ar-rahman"));

      const body = await res.json();
      expect(body[0].reason).toBe("Ayat al-Kursi affirms His mercy.");
      expect(body[1].reason).toMatch(/^Contains a form of/);
      expect(versesCacheWrites()).toHaveLength(1);
    });

    it("a non-English locale does not translate or cache placeholder reasons", async () => {
      withLocale("tr");
      mockSearchFetch(["2:255"]);
      mockCallAI.mockResolvedValue("I'm sorry, but I can't help with religious interpretation.");

      const res = await getVerses(req("ar-rahman", "verses"), params("ar-rahman"));

      expect((await res.json())[0].reason).toMatch(/^Contains a form of/);
      expect(mockCallAI).toHaveBeenCalledTimes(1); // no translateReason call
      expect(reasonCacheWrites()).toHaveLength(0);
      expect(versesCacheWrites()).toHaveLength(0);
    });
  });
});
