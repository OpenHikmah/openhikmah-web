import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { User } from "@/lib/infra/db/schema";

vi.mock("@/lib/admin/admin-auth", () => ({
  requireAdmin: vi.fn(),
  rateLimitAdminMutation: vi.fn(() => null),
}));
vi.mock("@/lib/admin/admin-audit", () => ({ logAdminAction: vi.fn() }));

function makeDbChain(resolveWith: unknown = [], calls?: Array<[string, unknown[]]>) {
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
        return (...args: unknown[]) => {
          calls?.push([String(prop), args]);
          return chain;
        };
      },
      apply() {
        return chain;
      },
    }
  );
  return chain;
}

const { mockSelect, mockUpdate, mockDelete, mockGetVerses } = vi.hoisted(() => ({
  mockSelect: vi.fn(() => makeDbChain([])),
  mockUpdate: vi.fn(() => makeDbChain([])),
  mockDelete: vi.fn(() => makeDbChain([])),
  mockGetVerses: vi.fn(),
}));
vi.mock("@/lib/infra/db", () => {
  const db = {
    select: mockSelect,
    update: mockUpdate,
    delete: mockDelete,
    transaction: async (fn: (tx: unknown) => unknown) =>
      fn({ update: mockUpdate, delete: mockDelete }),
  };
  return { db };
});
// Partial mock: real isValidRef (the shared ref gate), stubbed corpus lookup.
vi.mock("@/lib/quran/quran-corpus", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/quran/quran-corpus")>();
  return { ...actual, getVerses: mockGetVerses };
});

import { PgDialect } from "drizzle-orm/pg-core";
import { GET, PATCH, DELETE } from "@/app/api/admin/names/route";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { logAdminAction } from "@/lib/admin/admin-audit";

const admin = { userId: 1, user: { qfId: "qf-admin" } as User };

function get(query?: string) {
  const url = query
    ? `http://localhost/api/admin/names?${query}`
    : "http://localhost/api/admin/names";
  return new NextRequest(url, { headers: { Authorization: "Bearer t" } });
}
function patch(body: unknown) {
  return new NextRequest("http://localhost/api/admin/names", {
    method: "PATCH",
    headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
function del(query?: string) {
  const url = query
    ? `http://localhost/api/admin/names?${query}`
    : "http://localhost/api/admin/names";
  return new NextRequest(url, { method: "DELETE", headers: { Authorization: "Bearer t" } });
}

beforeEach(() => {
  vi.mocked(requireAdmin).mockResolvedValue(admin);
  mockSelect.mockReturnValue(makeDbChain([]));
  mockUpdate.mockClear().mockReturnValue(makeDbChain([]));
  mockDelete.mockClear().mockReturnValue(makeDbChain([]));
  mockGetVerses.mockReset().mockResolvedValue(new Map());
  vi.mocked(logAdminAction).mockClear();
});

// Verified corpus text (Ayat al-Kursi) the admin editor must store instead of
// anything the client sends.
const CORPUS_2_255 = {
  surah: 2,
  ayah: 255,
  ref: "2:255",
  arabicText: "اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ",
  translation: "Allah - there is no deity except Him, the Ever-Living, the Sustainer of existence.",
  surahName: "Al-Baqarah",
  surahNameArabic: "البقرة",
};
const corpusWith2_255 = () => new Map([["2:255", CORPUS_2_255]]);

function renderedWheres(calls: Array<[string, unknown[]]>) {
  const dialect = new PgDialect();
  return calls
    .filter(([name]) => name === "where")
    .map(([, args]) => dialect.sqlToQuery(args[0] as never));
}

describe("GET /api/admin/names", () => {
  it("returns the guard's own response for a non-admin caller", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(
      NextResponse.json({ error: "Not found" }, { status: 404 })
    );
    const res = await GET(get());
    expect(res.status).toBe(404);
  });

  it("returns rows with parsed data and falls back to raw string on bad JSON", async () => {
    mockSelect.mockReturnValue(
      makeDbChain([
        {
          slug: "ar-rahman",
          kind: "reflection",
          data: JSON.stringify({ text: "hi" }),
          model: "claude",
          version: 1,
          updatedAt: new Date("2026-01-01"),
        },
        {
          slug: "ar-rahim",
          kind: "reflection",
          data: "not-json",
          model: "claude",
          version: 1,
          updatedAt: new Date("2026-01-01"),
        },
      ])
    );
    const res = await GET(get());
    const body = await res.json();
    expect(body.rows[0].data).toEqual({ text: "hi" });
    expect(body.rows[1].data).toBe("not-json");
    expect(body.hasMore).toBe(false);
  });

  it("caps the page and sets hasMore when an extra row is returned", async () => {
    const many = Array.from({ length: 51 }, (_, i) => ({
      slug: `n${i}`,
      kind: "reflection",
      data: "x",
      model: null,
      version: 1,
      updatedAt: new Date("2026-01-01"),
    }));
    mockSelect.mockReturnValue(makeDbChain(many));
    const body = await (await GET(get())).json();
    expect(body.rows).toHaveLength(50);
    expect(body.hasMore).toBe(true);
  });

  it("passes the requested offset through to the query", async () => {
    const calls: Array<[string, unknown[]]> = [];
    mockSelect.mockReturnValue(makeDbChain([], calls));
    await GET(get("offset=50"));
    expect(calls).toContainEqual(["offset", [50]]);
  });
});

describe("PATCH /api/admin/names", () => {
  it("returns 400 for a malformed body", async () => {
    const req = new NextRequest("http://localhost/api/admin/names", {
      method: "PATCH",
      headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
      body: "not-json",
    });
    expect((await PATCH(req)).status).toBe(400);
  });

  it("returns 400 for a missing slug or invalid kind", async () => {
    expect((await PATCH(patch({ slug: "", kind: "verses", data: {} }))).status).toBe(400);
    expect((await PATCH(patch({ slug: "ar-rahman", kind: "bogus", data: {} }))).status).toBe(400);
  });

  it("returns 400 when data is missing", async () => {
    const res = await PATCH(patch({ slug: "ar-rahman", kind: "verses" }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when there's no cached row for that slug/kind", async () => {
    mockUpdate.mockReturnValue(makeDbChain([]));
    const res = await PATCH(patch({ slug: "ar-rahman", kind: "verses", data: [] }));
    expect(res.status).toBe(404);
  });

  it("stores the corpus text for a verse, not what the client sent, and logs the action", async () => {
    mockUpdate.mockReturnValue(makeDbChain([{ slug: "ar-rahman", kind: "verses" }]));
    mockGetVerses.mockResolvedValue(corpusWith2_255());
    const res = await PATCH(
      patch({
        slug: "ar-rahman",
        kind: "verses",
        data: [
          {
            ref: "2:255",
            surah: 2,
            ayah: 255,
            // Altered Arabic and translation, wrong names: all must be ignored.
            arabicText: "altered arabic",
            translation: "altered translation",
            surahName: "Wrong",
            surahNameArabic: "خطأ",
            reason: "Affirms the Ever-Living attribute.",
          },
        ],
      })
    );
    expect(res.status).toBe(200);
    const stored = [{ ...CORPUS_2_255, reason: "Affirms the Ever-Living attribute." }];
    expect((await res.json()).data).toEqual(stored);
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "name.edit", targetId: "ar-rahman/verses" })
    );
  });

  it("looks verses up in the corpus by ref and rejects one the corpus lacks, without persisting", async () => {
    mockGetVerses.mockResolvedValue(new Map());
    const res = await PATCH(
      patch({
        slug: "ar-rahman",
        kind: "verses",
        data: [{ ref: "2:255", reason: "A reason." }],
      })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("not in the Quran corpus");
    expect(mockGetVerses).toHaveBeenCalledWith(["2:255"]);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects a verse reason with Tashbih phrasing, without persisting", async () => {
    mockGetVerses.mockResolvedValue(corpusWith2_255());
    const res = await PATCH(
      patch({
        slug: "ar-rahman",
        kind: "verses",
        data: [{ ref: "2:255", reason: "He literally has a hand and sits on the throne." }],
      })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("Tashbih");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects a verse with a blank reason", async () => {
    const res = await PATCH(
      patch({ slug: "ar-rahman", kind: "verses", data: [{ ref: "2:255", reason: "  " }] })
    );
    expect(res.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects verses data that isn't an array of the expected shape", async () => {
    const res = await PATCH(patch({ slug: "ar-rahman", kind: "verses", data: { a: 1 } }));
    expect(res.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects verses data with a corpus-invalid ref, without persisting it", async () => {
    const res = await PATCH(
      patch({
        slug: "ar-rahman",
        kind: "verses",
        data: [
          {
            ref: "999:999",
            surah: 999,
            ayah: 999,
            arabicText: "a",
            translation: "t",
            surahName: "s",
            surahNameArabic: "s",
            reason: "r",
          },
        ],
      })
    );
    expect(res.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects verses data with a syntactically-plausible but non-existent ayah (ref out of range for a real surah)", async () => {
    const res = await PATCH(
      patch({
        slug: "ar-rahman",
        kind: "verses",
        data: [
          {
            // Al-Fatiha only has 7 ayahs.
            ref: "1:8",
            surah: 1,
            ayah: 8,
            arabicText: "a",
            translation: "t",
            surahName: "Al-Fatihah",
            surahNameArabic: "الفاتحة",
            reason: "r",
          },
        ],
      })
    );
    expect(res.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("ignores client-supplied surah/ayah that disagree with the ref and stores the corpus identity", async () => {
    mockUpdate.mockReturnValue(makeDbChain([{ slug: "ar-rahman", kind: "verses" }]));
    mockGetVerses.mockResolvedValue(corpusWith2_255());
    const res = await PATCH(
      patch({
        slug: "ar-rahman",
        kind: "verses",
        data: [{ ref: "2:255", surah: "1", ayah: 1, reason: "A reason." }],
      })
    );
    expect(res.status).toBe(200);
    const [verse] = (await res.json()).data;
    expect(verse).toMatchObject({ ref: "2:255", surah: 2, ayah: 255 });
  });

  it("accepts a valid reflection (plain string)", async () => {
    mockUpdate.mockReturnValue(makeDbChain([{ slug: "ar-rahman", kind: "reflection" }]));
    const res = await PATCH(
      patch({ slug: "ar-rahman", kind: "reflection", data: "A believer's reflection." })
    );
    expect(res.status).toBe(200);
  });

  it("rejects a reflection with Tashbih phrasing, without persisting", async () => {
    const res = await PATCH(
      patch({
        slug: "ar-rahman",
        kind: "reflection",
        data: "Allah takes the physical form of a radiant light.",
      })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("Tashbih");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects a reflection that isn't a string", async () => {
    const res = await PATCH(patch({ slug: "ar-rahman", kind: "reflection", data: { text: "x" } }));
    expect(res.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("accepts valid pairings", async () => {
    mockUpdate.mockReturnValue(makeDbChain([{ slug: "ar-rahman", kind: "pairings" }]));
    const res = await PATCH(
      patch({
        slug: "ar-rahman",
        kind: "pairings",
        data: [
          {
            name: "ar-rahim",
            transliteration: "Ar-Rahim",
            arabic: "الرَّحِيم",
            explanation: "Balances mercy in general and specific senses.",
          },
        ],
      })
    );
    expect(res.status).toBe(200);
  });

  it("overwrites a pairing's transliteration and arabic with the canonical name's", async () => {
    mockUpdate.mockReturnValue(makeDbChain([{ slug: "ar-rahman", kind: "pairings" }]));
    const res = await PATCH(
      patch({
        slug: "ar-rahman",
        kind: "pairings",
        data: [
          {
            name: "ar-rahim",
            transliteration: "Wrong",
            arabic: "خطأ",
            explanation: "Balances mercy in general and specific senses.",
          },
        ],
      })
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual([
      {
        name: "ar-rahim",
        transliteration: "Ar-Rahīm",
        arabic: "الرَّحِيم",
        explanation: "Balances mercy in general and specific senses.",
      },
    ]);
  });

  it("rejects a pairing whose name is not one of the 99, without persisting", async () => {
    const res = await PATCH(
      patch({
        slug: "ar-rahman",
        kind: "pairings",
        data: [
          {
            name: "not-a-real-name",
            transliteration: "Ar-Rahim",
            arabic: "الرَّحِيم",
            explanation: "Balances mercy in general and specific senses.",
          },
        ],
      })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("not one of the 99");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects a pairing explanation with Tashbih phrasing, without persisting", async () => {
    const res = await PATCH(
      patch({
        slug: "ar-rahman",
        kind: "pairings",
        data: [{ name: "ar-rahim", explanation: "He resembles a human in mercy." }],
      })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("Tashbih");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects pairings missing a required field", async () => {
    const res = await PATCH(
      patch({
        slug: "ar-rahman",
        kind: "pairings",
        data: [{ transliteration: "Ar-Rahim", arabic: "الرَّحِيم" }],
      })
    );
    expect(res.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects a pairing with an empty name (unresolved slug reference, see PR #89)", async () => {
    const res = await PATCH(
      patch({
        slug: "ar-rahman",
        kind: "pairings",
        data: [
          {
            name: "",
            transliteration: "Ar-Rahim",
            arabic: "الرَّحِيم",
            explanation: "Balances mercy in general and specific senses.",
          },
        ],
      })
    );
    expect(res.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/admin/names — locales", () => {
  it("edits only the en row and deletes the localized rows so they regenerate from the edit", async () => {
    const updateCalls: Array<[string, unknown[]]> = [];
    const deleteCalls: Array<[string, unknown[]]> = [];
    mockUpdate.mockReturnValue(
      makeDbChain([{ slug: "ar-rahman", kind: "reflection" }], updateCalls)
    );
    mockDelete.mockReturnValue(makeDbChain([], deleteCalls));

    const res = await PATCH(
      patch({ slug: "ar-rahman", kind: "reflection", data: "A believer's reflection." })
    );
    expect(res.status).toBe(200);

    const [updateWhere] = renderedWheres(updateCalls);
    expect(updateWhere.sql).toMatch(/"locale" = \$/);
    expect(updateWhere.params).toEqual(["ar-rahman", "reflection", "en"]);

    expect(mockDelete).toHaveBeenCalledTimes(1);
    const [deleteWhere] = renderedWheres(deleteCalls);
    expect(deleteWhere.sql).toMatch(/"locale" <> \$/);
    expect(deleteWhere.params).toEqual(["ar-rahman", "reflection", "en"]);
  });

  it("also clears the per-locale verse reasons when editing verses", async () => {
    mockUpdate.mockReturnValue(makeDbChain([{ slug: "ar-rahman", kind: "verses" }]));
    mockGetVerses.mockResolvedValue(corpusWith2_255());
    const res = await PATCH(
      patch({ slug: "ar-rahman", kind: "verses", data: [{ ref: "2:255", reason: "A reason." }] })
    );
    expect(res.status).toBe(200);
    // name_content localized rows + name_verse_reasons localized rows.
    expect(mockDelete).toHaveBeenCalledTimes(2);
  });

  it("deletes nothing when there is no en row to edit", async () => {
    mockUpdate.mockReturnValue(makeDbChain([]));
    const res = await PATCH(
      patch({ slug: "ar-rahman", kind: "reflection", data: "A reflection." })
    );
    expect(res.status).toBe(404);
    expect(mockDelete).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/admin/names", () => {
  it("returns 400 for a missing slug or kind", async () => {
    expect((await DELETE(del())).status).toBe(400);
    expect((await DELETE(del("slug=ar-rahman"))).status).toBe(400);
  });

  it("returns 400 for an invalid kind", async () => {
    expect((await DELETE(del("slug=ar-rahman&kind=bogus"))).status).toBe(400);
  });

  it("invalidates the cache entry and logs the action", async () => {
    const res = await DELETE(del("slug=ar-rahman&kind=verses"));
    expect(res.status).toBe(204);
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "name.invalidate", targetId: "ar-rahman/verses" })
    );
  });
});
