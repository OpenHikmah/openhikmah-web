import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { embed, embedBatch, embeddingModel, EMBEDDING_DIMENSIONS } from "@/lib/ai/ai";

function jsonResponse(json: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => json,
    text: async () => JSON.stringify(json),
  } as Response;
}

describe("embeddings", () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key";
    delete process.env.GEMINI_EMBEDDING_MODEL;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("embed() returns the vector for a single text and requests 768 dims", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ embeddings: [{ values: [0.1, 0.2, 0.3] }] }));
    vi.stubGlobal("fetch", fetchMock);

    const v = await embed("patience");
    expect(v).toEqual([0.1, 0.2, 0.3]);

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.requests[0].content.parts[0].text).toBe("patience");
    expect(body.requests[0].outputDimensionality).toBe(768);
  });

  it("embedBatch() preserves input order", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ embeddings: [{ values: [1] }, { values: [2] }, { values: [3] }] })
        )
    );
    const out = await embedBatch(["a", "b", "c"]);
    expect(out).toEqual([[1], [2], [3]]);
  });

  it("embedBatch() short-circuits on empty input without calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const out = await embedBatch([]);
    expect(out).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws when GEMINI_API_KEY is missing", async () => {
    delete process.env.GEMINI_API_KEY;
    vi.stubGlobal("fetch", vi.fn());
    await expect(embed("x")).rejects.toThrow("GEMINI_API_KEY is not set");
  });

  it("throws on a non-OK embedding response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "nope" }, false, 404)));
    await expect(embed("x")).rejects.toThrow(/Embedding request failed/);
  });

  it("defaults the embedding model and respects the override", () => {
    expect(embeddingModel()).toBe("gemini-embedding-001");
    process.env.GEMINI_EMBEDDING_MODEL = "custom-model";
    expect(embeddingModel()).toBe("custom-model");
  });

  it("exposes a dimension that matches the schema vector size", () => {
    expect(EMBEDDING_DIMENSIONS).toBe(768);
  });
});
