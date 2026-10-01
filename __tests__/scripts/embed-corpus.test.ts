// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PER_MINUTE_MAX_RETRIES } from "@/lib/ai/gemini-errors";
import { embedBatch } from "../../scripts/embed-corpus.mjs";

const PER_MINUTE_429 = JSON.stringify({
  error: {
    code: 429,
    status: "RESOURCE_EXHAUSTED",
    details: [
      { quotaId: "EmbedContentRequestsPerMinutePerProjectPerModel" },
      { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "21s" },
    ],
  },
});
const DAILY_429 = JSON.stringify({
  error: {
    code: 429,
    status: "RESOURCE_EXHAUSTED",
    details: [{ quotaId: "EmbedContentRequestsPerDayPerProjectPerModel" }],
  },
});

const vector = () => Array.from({ length: 768 }, () => 0.1);
const ok = (n: number) =>
  new Response(
    JSON.stringify({ embeddings: Array.from({ length: n }, () => ({ values: vector() })) })
  );
const tooMany = (body: string) => new Response(body, { status: 429 });

const fetchMock = vi.fn<typeof fetch>();
const sleep = vi.fn(async (_ms: number) => undefined);

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  fetchMock.mockReset();
  sleep.mockClear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("embedBatch", () => {
  it("waits out a per-minute 429 for at least the provider retryDelay, then succeeds", async () => {
    fetchMock.mockResolvedValueOnce(tooMany(PER_MINUTE_429)).mockResolvedValueOnce(ok(2));

    const vectors = await embedBatch(["a", "b"], sleep);

    expect(vectors).toHaveLength(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep.mock.calls[0][0]).toBeGreaterThanOrEqual(21_000);
  });

  it("gives up after PER_MINUTE_MAX_RETRIES instead of retrying forever", async () => {
    fetchMock.mockImplementation(async () => tooMany(PER_MINUTE_429));

    await expect(embedBatch(["a"], sleep)).resolves.toBeNull();

    expect(sleep).toHaveBeenCalledTimes(PER_MINUTE_MAX_RETRIES);
    expect(fetchMock).toHaveBeenCalledTimes(PER_MINUTE_MAX_RETRIES + 1);
  });

  it("stops immediately on a daily quota 429", async () => {
    fetchMock.mockResolvedValueOnce(tooMany(DAILY_429));

    await expect(embedBatch(["a"], sleep)).resolves.toBeNull();

    expect(sleep).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws on a non-rate-limit error", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('{"error":{"message":"API key not valid"}}', { status: 400 })
    );

    await expect(embedBatch(["a"], sleep)).rejects.toThrow(/Embedding request failed: 400/);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("bounds every request with an abort signal", async () => {
    fetchMock.mockResolvedValueOnce(ok(1));

    await embedBatch(["a"], sleep);

    expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("propagates a timed-out request as an error", async () => {
    fetchMock.mockRejectedValueOnce(new DOMException("timed out", "TimeoutError"));

    await expect(embedBatch(["a"], sleep)).rejects.toThrow(/timed out/);
  });
});
