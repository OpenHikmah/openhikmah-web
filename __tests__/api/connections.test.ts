import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}));

vi.mock("@anthropic-ai/sdk", () => {
  const mockText = JSON.stringify([
    { ref: "2:255", reason: "The Throne Verse manifests divine sovereignty." },
    { ref: "3:18", reason: "Allah witnesses His own oneness directly." },
    { ref: "112:1", reason: "Pure tawhid — the essence of divine singularity." },
  ]);

  class MockAnthropic {
    messages = {
      create: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: mockText }],
      }),
    };
  }

  return { default: MockAnthropic };
});

import { POST } from "@/app/api/connections/route";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function arabicResp(text = "آية كريمة") {
  return { ok: true, json: async () => ({ data: { text } }) };
}
function transResp(text = "A noble verse.") {
  return { ok: true, json: async () => ({ data: { text } }) };
}

function makeRequest(body: Record<string, string>) {
  return new NextRequest("http://localhost/api/connections", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/connections", () => {
  beforeEach(() => mockFetch.mockReset());

  it("returns 400 when fromRef is missing", async () => {
    const req = makeRequest({ kind: "thematic", arabicText: "text", translation: "trans" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when kind is missing", async () => {
    const req = makeRequest({ fromRef: "1:1", arabicText: "text", translation: "trans" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid kind", async () => {
    const req = makeRequest({ fromRef: "1:1", kind: "bogus", arabicText: "text", translation: "trans" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 200 with 3 ConnectionResult objects for a valid request", async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (typeof url !== "string") return { ok: false };
      if (url.includes("ar.alafasy")) return arabicResp("نص عربي");
      if (url.includes("en.sahih")) return transResp("English translation");
      return { ok: false };
    });

    const req = makeRequest({
      fromRef: "1:1",
      kind: "thematic",
      arabicText: "بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ",
      translation: "In the name of Allah, the Most Gracious, the Most Merciful.",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(3);
  });

  it("each result has ref, arabicText, translation, surahName, reason, and kind", async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (typeof url !== "string") return { ok: false };
      if (url.includes("ar.alafasy")) return arabicResp("نص عربي");
      if (url.includes("en.sahih")) return transResp("English translation");
      return { ok: false };
    });

    const req = makeRequest({
      fromRef: "2:255",
      kind: "contrast",
      arabicText: "اللَّهُ لَا إِلَهَ إِلَّا هُوَ",
      translation: "Allah — there is no deity except Him.",
    });
    const res = await POST(req);
    const body = await res.json();
    for (const item of body) {
      expect(item).toHaveProperty("ref");
      expect(item).toHaveProperty("arabicText");
      expect(item).toHaveProperty("translation");
      expect(item).toHaveProperty("surahName");
      expect(item).toHaveProperty("reason");
      expect(item).toHaveProperty("kind", "contrast");
    }
  });
});
