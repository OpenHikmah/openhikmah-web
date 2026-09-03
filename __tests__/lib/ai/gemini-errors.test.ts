import { describe, it, expect } from "vitest";
import {
  GeminiDailyQuotaError,
  GeminiRateLimitError,
  classifyGeminiError,
  perMinuteBackoffMs,
  PER_MINUTE_MAX_DELAY_MS,
} from "@/lib/ai/gemini-errors";

/** Shape of what `@google/generative-ai` throws for a non-2xx. */
function fetchError(
  status: number,
  errorDetails: unknown[],
  message = `[GoogleGenerativeAI Error]: ${status}`
) {
  return Object.assign(new Error(message), {
    status,
    statusText: "Too Many Requests",
    errorDetails,
  });
}

const perDayViolation = {
  "@type": "type.googleapis.com/google.rpc.QuotaFailure",
  violations: [
    {
      quotaMetric: "generativelanguage.googleapis.com/generate_content_free_tier_requests",
      quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier",
      quotaDimensions: { model: "gemini-3.5-flash-lite", location: "global" },
    },
  ],
};
const perMinuteViolation = {
  "@type": "type.googleapis.com/google.rpc.QuotaFailure",
  violations: [{ quotaId: "GenerateRequestsPerMinutePerProjectPerModel-FreeTier" }],
};
const retryInfo = { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "39s" };

describe("classifyGeminiError", () => {
  it("classifies a per-day QuotaFailure from errorDetails as daily", () => {
    const info = classifyGeminiError(fetchError(429, [perDayViolation, retryInfo]));
    expect(info.cls).toBe("daily");
    expect(info.quotaId).toMatch(/PerDay/);
    expect(info.retryAfterMs).toBe(39_000);
  });

  it("classifies a per-day quota from the message string alone", () => {
    const info = classifyGeminiError(
      fetchError(429, [], "You exceeded your current quota: GenerateRequestsPerDay limit")
    );
    expect(info.cls).toBe("daily");
  });

  it("classifies a per-minute QuotaFailure as per-minute", () => {
    const info = classifyGeminiError(fetchError(429, [perMinuteViolation]));
    expect(info.cls).toBe("per-minute");
  });

  it("falls back to other-429 for a bare 429 with no quota markers", () => {
    const info = classifyGeminiError(fetchError(429, [], "429 Too Many Requests"));
    expect(info.cls).toBe("other-429");
  });

  it("does NOT treat a non-429 status as rate-limited even when it mentions quota", () => {
    // 403 PERMISSION_DENIED "Quota exceeded ... consumer suspended", 400 quota-project
    expect(
      classifyGeminiError(
        fetchError(403, [], "Quota exceeded for quota metric; consumer suspended")
      ).cls
    ).toBe("not-rate-limit");
    expect(
      classifyGeminiError(fetchError(400, [], "RESOURCE_EXHAUSTED quota project issue")).cls
    ).toBe("not-rate-limit");
  });

  it("treats a 500 / network error as not-rate-limit", () => {
    expect(classifyGeminiError(fetchError(500, [], "500 Internal Server Error")).cls).toBe(
      "not-rate-limit"
    );
    expect(classifyGeminiError(new Error("fetch failed")).cls).toBe("not-rate-limit");
  });

  it("tolerates non-Error input", () => {
    expect(classifyGeminiError(undefined).cls).toBe("not-rate-limit");
    expect(classifyGeminiError("boom").cls).toBe("not-rate-limit");
  });
});

describe("typed errors", () => {
  it("GeminiDailyQuotaError carries the classification info", () => {
    const info = classifyGeminiError(fetchError(429, [perDayViolation]));
    const err = new GeminiDailyQuotaError(info);
    expect(err).toBeInstanceOf(Error);
    expect(err.info.cls).toBe("daily");
    expect(err.name).toBe("GeminiDailyQuotaError");
  });

  it("GeminiRateLimitError records the attempt count", () => {
    const err = new GeminiRateLimitError(classifyGeminiError(fetchError(429, [])), 6);
    expect(err.attempts).toBe(6);
  });
});

describe("perMinuteBackoffMs", () => {
  it("honours an explicit retryAfterMs (within jitter)", () => {
    const ms = perMinuteBackoffMs(1, 12_000);
    expect(ms).toBeGreaterThanOrEqual(12_000 * 0.85);
    expect(ms).toBeLessThanOrEqual(12_000 * 1.15);
  });

  it("caps the exponential backoff", () => {
    expect(perMinuteBackoffMs(20)).toBeLessThanOrEqual(PER_MINUTE_MAX_DELAY_MS * 1.15);
  });

  it("floors a zero retryDelay so retries never burst back-to-back", () => {
    // Google does emit "retryDelay": "0s" → parsed as 0, must not mean "no wait".
    expect(perMinuteBackoffMs(1, 0)).toBeGreaterThanOrEqual(1000);
  });
});
