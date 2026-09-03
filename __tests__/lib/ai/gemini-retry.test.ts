import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockGenerate, ctorKeys } = vi.hoisted(() => ({
  mockGenerate: vi.fn(),
  ctorKeys: [] as string[],
}));

vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: class {
    constructor(key: string) {
      ctorKeys.push(key);
    }
    getGenerativeModel() {
      return { generateContent: mockGenerate };
    }
  },
}));
vi.mock("@anthropic-ai/sdk", () => ({ default: class {} }));
vi.mock("@/lib/admin/feature-flags", () => ({
  getFlagString: vi.fn((_k: string, fallback: string) => fallback),
}));

import { callAIDetailed, resetGeminiRateLimitState } from "@/lib/ai/ai";
import { GeminiDailyQuotaError, GeminiRateLimitError } from "@/lib/ai/gemini-errors";

function fetchError(details: unknown[], message = "429") {
  return Object.assign(new Error(message), { status: 429, errorDetails: details });
}
const perMinute = [
  { "@type": "google.rpc.QuotaFailure", violations: [{ quotaId: "GenerateRequestsPerMinute" }] },
  { "@type": "google.rpc.RetryInfo", retryDelay: "1s" },
];
const perDay = [
  {
    "@type": "google.rpc.QuotaFailure",
    violations: [{ quotaId: "GenerateRequestsPerDayPerModel" }],
  },
];
const ok = { response: { text: () => "generated", usageMetadata: null } };

beforeEach(() => {
  vi.useFakeTimers();
  mockGenerate.mockReset();
  ctorKeys.length = 0;
  resetGeminiRateLimitState();
  process.env.GEMINI_API_KEY = "env-key";
});
afterEach(() => {
  vi.useRealTimers();
  delete process.env.GEMINI_API_KEY;
});

describe("callGemini retry / classification", () => {
  it("retries a per-minute 429 then succeeds", async () => {
    mockGenerate
      .mockRejectedValueOnce(fetchError(perMinute))
      .mockRejectedValueOnce(fetchError(perMinute))
      .mockResolvedValueOnce(ok);

    const p = callAIDetailed("hi", { provider: "gemini" });
    await vi.runAllTimersAsync();
    const res = await p;
    expect(res.text).toBe("generated");
    expect(mockGenerate).toHaveBeenCalledTimes(3);
  });

  it("throws GeminiRateLimitError once per-minute retries are exhausted", async () => {
    mockGenerate.mockRejectedValue(fetchError(perMinute));
    const p = callAIDetailed("hi", { provider: "gemini" }).catch((e) => e);
    await vi.runAllTimersAsync();
    expect(await p).toBeInstanceOf(GeminiRateLimitError);
  });

  it("throws GeminiDailyQuotaError immediately on a per-day quota, with no retry", async () => {
    mockGenerate.mockRejectedValue(fetchError(perDay));
    await expect(callAIDetailed("hi", { provider: "gemini" })).rejects.toBeInstanceOf(
      GeminiDailyQuotaError
    );
    expect(mockGenerate).toHaveBeenCalledTimes(1);
  });

  it("uses the explicit apiKey, not process.env.GEMINI_API_KEY", async () => {
    mockGenerate.mockResolvedValueOnce(ok);
    await callAIDetailed("hi", { provider: "gemini", apiKey: "loop-key-2" });
    expect(ctorKeys).toEqual(["loop-key-2"]);
  });

  it("forwards the AbortSignal into the generateContent request", async () => {
    mockGenerate.mockResolvedValueOnce(ok);
    const ac = new AbortController();
    await callAIDetailed("hi", { provider: "gemini", signal: ac.signal });
    expect(mockGenerate).toHaveBeenCalledWith("hi", { signal: ac.signal });
  });

  it("propagates an abort thrown by generateContent itself", async () => {
    mockGenerate.mockRejectedValueOnce(
      Object.assign(new Error("The operation was aborted"), { name: "AbortError" })
    );
    await expect(callAIDetailed("hi", { provider: "gemini" })).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(mockGenerate).toHaveBeenCalledTimes(1);
  });

  it("aborts a backoff wait when the signal fires", async () => {
    mockGenerate.mockRejectedValue(fetchError(perMinute));
    const ac = new AbortController();
    const p = callAIDetailed("hi", { provider: "gemini", signal: ac.signal }).catch((e) => e);
    await vi.advanceTimersByTimeAsync(10);
    ac.abort();
    const err = await p;
    expect(err).toBeInstanceOf(Error);
    expect(mockGenerate).toHaveBeenCalledTimes(1);
  });

  it("escalates to GeminiDailyQuotaError after 8 consecutive ambiguous 429s", async () => {
    mockGenerate.mockRejectedValue(fetchError([], "429 Too Many Requests"));
    // Each call does up to PER_MINUTE_MAX_RETRIES (6) attempts; the ambiguous
    // streak persists across calls until it crosses 8.
    let last: unknown;
    for (let i = 0; i < 3; i++) {
      const p = callAIDetailed("hi", { provider: "gemini" }).catch((e) => e);
      await vi.runAllTimersAsync();
      last = await p;
      if (last instanceof GeminiDailyQuotaError) break;
    }
    expect(last).toBeInstanceOf(GeminiDailyQuotaError);
  });
});
