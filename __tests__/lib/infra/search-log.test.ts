import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockInsert, values } = vi.hoisted(() => {
  const values = vi.fn();
  return { mockInsert: vi.fn(() => ({ values })), values };
});

vi.mock("@/lib/infra/db", () => ({ db: { insert: mockInsert } }));

import { logSearchQuery } from "@/lib/infra/search-log";
import { searchLog } from "@/lib/infra/db/schema";

beforeEach(() => {
  mockInsert.mockClear();
  values.mockReset();
  values.mockResolvedValue(undefined);
});

describe("logSearchQuery", () => {
  it("records the query, mode and count", async () => {
    await logSearchQuery("patience", "keyword", 12);
    expect(mockInsert).toHaveBeenCalledWith(searchLog);
    expect(values).toHaveBeenCalledWith({
      query: "patience",
      mode: "keyword",
      resultCount: 12,
      zeroResult: false,
    });
  });

  it("flags a search with no results so curation can act on it", async () => {
    await logSearchQuery("sabr in the dark", "meaning", 0);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "meaning", resultCount: 0, zeroResult: true })
    );
  });

  it("never throws when the write fails, but reports it", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    values.mockRejectedValue(new Error("db down"));
    await expect(logSearchQuery("x", "keyword", 1)).resolves.toBeUndefined();
    expect(err).toHaveBeenCalledWith("search_log write failed:", expect.any(Error));
    err.mockRestore();
  });
});
