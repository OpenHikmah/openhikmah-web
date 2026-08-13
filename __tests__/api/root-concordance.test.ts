import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

function makeDbChain(resolveWith: unknown = []) {
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

const { mockSelectDistinct, mockGetVerses } = vi.hoisted(() => ({
  mockSelectDistinct: vi.fn(() => makeDbChain([])),
  mockGetVerses: vi.fn(async () => new Map()),
}));
vi.mock("@/lib/infra/db", () => ({ db: { selectDistinct: mockSelectDistinct } }));
vi.mock("@/lib/quran/quran-corpus", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/quran/quran-corpus")>();
  return { ...actual, getVerses: mockGetVerses };
});

import { GET } from "@/app/api/root/[root]/route";

function req() {
  return new NextRequest("http://localhost/api/root/رحم");
}
function params(root: string) {
  return { params: Promise.resolve({ root }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSelectDistinct.mockReturnValue(makeDbChain([]));
  mockGetVerses.mockResolvedValue(new Map());
});

describe("GET /api/root/[root]", () => {
  it("400s on an empty/whitespace-only root", async () => {
    const res = await GET(req(), params("   "));
    expect(res.status).toBe(400);
  });

  it("returns verses for a root in the order the DB query resolved them", async () => {
    // The route does not re-sort after the query — see issue #360 (lexicographic
    // vs. numeric ref ordering), which is a separate, already-tracked bug.
    // This only pins the route's actual passthrough behavior: whatever order
    // rows come back in is the order returned to the client.
    mockSelectDistinct.mockReturnValue(makeDbChain([{ ref: "2:255" }, { ref: "10:5" }]));
    mockGetVerses.mockResolvedValue(
      new Map([
        [
          "2:255",
          {
            ref: "2:255",
            surahName: "Al-Baqarah",
            surahNameArabic: "البقرة",
            translation: "Allah - there is no deity except Him.",
          },
        ],
        [
          "10:5",
          {
            ref: "10:5",
            surahName: "Yunus",
            surahNameArabic: "يونس",
            translation: "It is He who made the sun a shining light.",
          },
        ],
      ])
    );

    const res = await GET(req(), params("رحم"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.root).toBe("رحم");
    expect(body.count).toBe(2);
    expect(body.verses.map((v: { ref: string }) => v.ref)).toEqual(["2:255", "10:5"]);
  });

  it("truncates each verse's translation to a short snippet", async () => {
    mockSelectDistinct.mockReturnValue(makeDbChain([{ ref: "2:255" }]));
    mockGetVerses.mockResolvedValue(
      new Map([
        [
          "2:255",
          {
            ref: "2:255",
            surahName: "Al-Baqarah",
            surahNameArabic: "البقرة",
            translation:
              "Allah - there is no deity except Him, the Ever-Living, the Sustainer of [all] existence. Neither drowsiness overtakes Him nor sleep. To Him belongs whatever is in the heavens and whatever is on the earth. Who is it that can intercede with Him except by His permission? He knows what is [presently] before them and what will be after them, and they encompass not a thing of His knowledge except for what He wills. His Kursi extends over the heavens and the earth, and their preservation tires Him not. And He is the Most High, the Most Great.",
          },
        ],
      ])
    );

    const res = await GET(req(), params("رحم"));
    const body = await res.json();
    expect(body.verses[0].snippet).toHaveLength(140);
  });

  it("drops refs the corpus lookup didn't resolve, without failing the request", async () => {
    mockSelectDistinct.mockReturnValue(makeDbChain([{ ref: "2:255" }, { ref: "114:6" }]));
    mockGetVerses.mockResolvedValue(
      new Map([
        [
          "2:255",
          {
            ref: "2:255",
            surahName: "Al-Baqarah",
            surahNameArabic: "البقرة",
            translation: "Allah - there is no deity except Him.",
          },
        ],
      ])
    );

    const res = await GET(req(), params("رحم"));
    const body = await res.json();
    expect(body.count).toBe(1);
    expect(body.verses).toHaveLength(1);
  });

  it("degrades to an empty result on a DB error instead of failing the request", async () => {
    mockSelectDistinct.mockImplementation(() => {
      throw new Error("connection reset");
    });

    const res = await GET(req(), params("رحم"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ root: "رحم", count: 0, verses: [] });
  });
});
