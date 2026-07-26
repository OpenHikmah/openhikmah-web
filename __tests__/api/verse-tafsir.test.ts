import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const { mockRateLimitOrNull } = vi.hoisted(() => ({
  mockRateLimitOrNull: vi.fn(async (): Promise<NextResponse | null> => null),
}));
vi.mock("@/lib/infra/rate-limit", () => ({ rateLimitOrNull: mockRateLimitOrNull }));

import { GET } from "@/app/api/verse/[surah]/[ayah]/tafsir/route";

function call(surah: string, ayah: string) {
  return GET(new NextRequest("http://localhost/api/verse/x/tafsir"), {
    params: Promise.resolve({ surah, ayah }),
  });
}

describe("GET /api/verse/[surah]/[ayah]/tafsir", () => {
  beforeEach(() => {
    mockRateLimitOrNull.mockReset().mockResolvedValue(null);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ tafsir: { text: "<p>Some tafsir</p>" } }),
      })
    );
  });

  it("returns 429 when the rate limiter reports over-limit, without calling the upstream API", async () => {
    mockRateLimitOrNull.mockResolvedValue(
      NextResponse.json({ error: "Too many requests" }, { status: 429 })
    );
    const res = await call("1", "1");
    expect(res.status).toBe(429);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns 400 for an out-of-bounds reference without calling the upstream API", async () => {
    const res = await call("999", "1");
    expect(res.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns tafsir blocks for a valid ref", async () => {
    const res = await call("1", "1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.blocks.length).toBeGreaterThan(0);
    expect(body.source).toBe("Ibn Kathir (Abridged)");
  });
});
