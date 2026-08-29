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

const { mockSelect, mockUpdate, mockDelete } = vi.hoisted(() => ({
  mockSelect: vi.fn(() => makeDbChain([])),
  mockUpdate: vi.fn(() => makeDbChain([])),
  mockDelete: vi.fn(() => makeDbChain([])),
}));
vi.mock("@/lib/infra/db", () => ({
  db: { select: mockSelect, update: mockUpdate, delete: mockDelete },
}));

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
  mockDelete.mockReturnValue(makeDbChain([]));
  vi.mocked(logAdminAction).mockClear();
});

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

  it("updates the cached content and logs the action", async () => {
    mockUpdate.mockReturnValue(makeDbChain([{ slug: "ar-rahman", kind: "verses" }]));
    const validVerse = [
      {
        ref: "2:255",
        surah: 2,
        ayah: 255,
        arabicText: "اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ",
        translation: "translation",
        surahName: "Al-Baqarah",
        surahNameArabic: "البقرة",
        reason: "reason",
      },
    ];
    const res = await PATCH(patch({ slug: "ar-rahman", kind: "verses", data: validVerse }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual(validVerse);
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "name.edit", targetId: "ar-rahman/verses" })
    );
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

  it("rejects verses data with a wrong field type (surah as string)", async () => {
    const res = await PATCH(
      patch({
        slug: "ar-rahman",
        kind: "verses",
        data: [
          {
            ref: "2:255",
            surah: "2",
            ayah: 255,
            arabicText: "اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ",
            translation: "t",
            surahName: "s",
            surahNameArabic: "s",
            reason: "r",
          },
        ],
      })
    );
    expect(res.status).toBe(400);
  });

  it("rejects verses data where surah/ayah don't match the parsed ref", async () => {
    const res = await PATCH(
      patch({
        slug: "ar-rahman",
        kind: "verses",
        data: [
          {
            // Valid ref, but surah/ayah point at a different verse (1:1) —
            // downstream features that key off surah/ayah (e.g.
            // InteractiveArabic morphology lookups) would then disagree
            // with the ref-identified verse.
            ref: "1:1",
            surah: 2,
            ayah: 255,
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

  it("accepts a valid reflection (plain string)", async () => {
    mockUpdate.mockReturnValue(makeDbChain([{ slug: "ar-rahman", kind: "reflection" }]));
    const res = await PATCH(
      patch({ slug: "ar-rahman", kind: "reflection", data: "A believer's reflection." })
    );
    expect(res.status).toBe(200);
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
