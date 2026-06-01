import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockEmbedContent, mockBatchEmbedContents, mockGetGenerativeModel } = vi.hoisted(() => {
  const embedContent = vi.fn();
  const batchEmbedContents = vi.fn();
  const getGenerativeModel = vi.fn(() => ({
    embedContent,
    batchEmbedContents,
    generateContent: vi.fn(),
  }));
  return {
    mockEmbedContent: embedContent,
    mockBatchEmbedContents: batchEmbedContents,
    mockGetGenerativeModel: getGenerativeModel,
  };
});

vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: vi.fn(function () {
    return { getGenerativeModel: mockGetGenerativeModel };
  }),
}));

import { embed, embedBatch, embeddingModel, EMBEDDING_DIMENSIONS } from "@/lib/ai";

describe("embeddings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GEMINI_API_KEY = "test-key";
    delete process.env.GEMINI_EMBEDDING_MODEL;
  });

  it("embed() returns the vector for a single text", async () => {
    mockEmbedContent.mockResolvedValue({ embedding: { values: [0.1, 0.2, 0.3] } });
    const v = await embed("patience");
    expect(v).toEqual([0.1, 0.2, 0.3]);
    expect(mockEmbedContent).toHaveBeenCalledWith("patience");
  });

  it("embedBatch() preserves input order", async () => {
    mockBatchEmbedContents.mockResolvedValue({
      embeddings: [{ values: [1] }, { values: [2] }, { values: [3] }],
    });
    const out = await embedBatch(["a", "b", "c"]);
    expect(out).toEqual([[1], [2], [3]]);
  });

  it("embedBatch() short-circuits on empty input without calling the API", async () => {
    const out = await embedBatch([]);
    expect(out).toEqual([]);
    expect(mockBatchEmbedContents).not.toHaveBeenCalled();
  });

  it("throws when GEMINI_API_KEY is missing", async () => {
    delete process.env.GEMINI_API_KEY;
    await expect(embed("x")).rejects.toThrow("GEMINI_API_KEY is not set");
  });

  it("defaults the embedding model and respects the override", () => {
    expect(embeddingModel()).toBe("text-embedding-004");
    process.env.GEMINI_EMBEDDING_MODEL = "custom-model";
    expect(embeddingModel()).toBe("custom-model");
  });

  it("exposes a dimension that matches the schema vector size", () => {
    expect(EMBEDDING_DIMENSIONS).toBe(768);
  });
});
