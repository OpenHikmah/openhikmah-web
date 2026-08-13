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

const { mockSelect } = vi.hoisted(() => ({
  mockSelect: vi.fn(() => makeDbChain([])),
}));
vi.mock("@/lib/infra/db", () => ({ db: { select: mockSelect } }));

import { GET } from "@/app/api/verse/[surah]/[ayah]/morphology/route";

function req() {
  return new NextRequest("http://localhost/api/verse/2/255/morphology");
}
function params(surah: string, ayah: string) {
  return { params: Promise.resolve({ surah, ayah }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSelect.mockReturnValue(makeDbChain([]));
});

describe("GET /api/verse/[surah]/[ayah]/morphology", () => {
  it("400s on an invalid verse reference", async () => {
    const res = await GET(req(), params("999", "1"));
    expect(res.status).toBe(400);
  });

  it("returns the seeded words for a valid, seeded verse", async () => {
    const words = [
      { position: 1, surface: "اللَّهُ", root: "أله", lemma: "الله" },
      { position: 2, surface: "لَا", root: null, lemma: "لا" },
    ];
    mockSelect.mockReturnValue(makeDbChain(words));

    const res = await GET(req(), params("2", "255"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ words });
  });

  it("returns an empty words array (still 200) for a valid but unseeded verse", async () => {
    mockSelect.mockReturnValue(makeDbChain([]));

    const res = await GET(req(), params("2", "255"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ words: [] });
  });

  it("degrades to an empty words array on a DB error instead of failing the request", async () => {
    mockSelect.mockImplementation(() => {
      throw new Error("connection reset");
    });

    const res = await GET(req(), params("2", "255"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ words: [] });
  });
});
