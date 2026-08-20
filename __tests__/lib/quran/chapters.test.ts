import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchLocalizedChapterNames } from "@/lib/quran/chapters";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function chaptersResponse(chapters: unknown[]) {
  return { ok: true, json: async () => ({ chapters }) };
}

describe("fetchLocalizedChapterNames", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("does not fetch for English — callers fall back to SURAH_NAMES", async () => {
    const result = await fetchLocalizedChapterNames("en");
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.size).toBe(0);
  });

  it("parses translated_name.name keyed by chapter id", async () => {
    mockFetch.mockResolvedValueOnce(
      chaptersResponse([
        { id: 1, translated_name: { name: "Fâtiha" } },
        { id: 18, translated_name: { name: "Kehf" } },
      ])
    );
    const result = await fetchLocalizedChapterNames("tr");
    expect(result.get(1)).toBe("Fâtiha");
    expect(result.get(18)).toBe("Kehf");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.quran.com/api/v4/chapters?language=tr",
      expect.anything()
    );
  });

  it("skips chapters missing an id or translated_name", async () => {
    mockFetch.mockResolvedValueOnce(
      chaptersResponse([
        { id: 1, translated_name: { name: "Fâtiha" } },
        { id: 2 },
        { translated_name: { name: "orphan" } },
      ])
    );
    const result = await fetchLocalizedChapterNames("tr");
    expect(result.size).toBe(1);
    expect(result.get(1)).toBe("Fâtiha");
  });

  it("returns an empty map when the response is not ok", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    const result = await fetchLocalizedChapterNames("ru");
    expect(result.size).toBe(0);
  });

  it("returns an empty map when the fetch throws", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network error"));
    const result = await fetchLocalizedChapterNames("az");
    expect(result.size).toBe(0);
  });
});
