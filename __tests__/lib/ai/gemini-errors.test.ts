import { describe, it, expect } from "vitest";
import {
  GeminiDailyQuotaError,
  GeminiKeyInvalidError,
  GeminiRateLimitError,
  classifyGeminiError,
  perMinuteBackoffMs,
  PER_MINUTE_MAX_DELAY_MS,
  PER_MINUTE_MIN_DELAY_MS,
  PER_MINUTE_PROVIDER_DELAY_CAP_MS,
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
const absurdRetryInfo = {
  "@type": "type.googleapis.com/google.rpc.RetryInfo",
  retryDelay: "86400s",
};

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

  it("keeps per-minute classification when retryDelay is within the cap", () => {
    const info = classifyGeminiError(fetchError(429, [perMinuteViolation, retryInfo]));
    expect(info.cls).toBe("per-minute");
    expect(info.retryAfterMs).toBe(39_000);
  });

  it("reclassifies as daily when a per-minute 429 carries an absurd retryDelay", () => {
    // "retryDelay":"86400s" on one cell would otherwise stall the loop 24h with
    // no key rotation — past the cap it is effectively a per-day exhaustion.
    const info = classifyGeminiError(fetchError(429, [perMinuteViolation, absurdRetryInfo]));
    expect(info.cls).toBe("daily");
    expect(info.retryAfterMs).toBe(86_400_000);
  });

  it("reclassifies a bare 429 as daily when its retryDelay exceeds the cap", () => {
    const info = classifyGeminiError(fetchError(429, [absurdRetryInfo], "429 Too Many Requests"));
    expect(info.cls).toBe("daily");
  });

  it("treats the cap boundary as inclusive — exactly the cap stays per-minute, just past it is daily", () => {
    const retry = (ms: number) => ({
      "@type": "type.googleapis.com/google.rpc.RetryInfo",
      retryDelay: `${ms / 1000}s`,
    });
    expect(
      classifyGeminiError(
        fetchError(429, [perMinuteViolation, retry(PER_MINUTE_PROVIDER_DELAY_CAP_MS)])
      ).cls
    ).toBe("per-minute");
    expect(
      classifyGeminiError(
        fetchError(429, [perMinuteViolation, retry(PER_MINUTE_PROVIDER_DELAY_CAP_MS + 1000)])
      ).cls
    ).toBe("daily");
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

  it("classifies a 400 API_KEY_INVALID as key-invalid", () => {
    const detail = {
      "@type": "type.googleapis.com/google.rpc.ErrorInfo",
      reason: "API_KEY_INVALID",
      domain: "googleapis.com",
    };
    const info = classifyGeminiError(
      fetchError(400, [detail], "API key not valid. Please pass a valid API key.")
    );
    expect(info.cls).toBe("key-invalid");
    expect(info.status).toBe(400);
  });

  it("leaves a 403 PERMISSION_DENIED as not-rate-limit (project-level, loop should stop)", () => {
    expect(
      classifyGeminiError(
        fetchError(403, [], "PERMISSION_DENIED: API has not been used in project")
      ).cls
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

  it("GeminiKeyInvalidError carries the classification info", () => {
    const info = classifyGeminiError(fetchError(400, [], "API key not valid"));
    const err = new GeminiKeyInvalidError(info);
    expect(err).toBeInstanceOf(Error);
    expect(err.info.cls).toBe("key-invalid");
    expect(err.name).toBe("GeminiKeyInvalidError");
  });
});

describe("perMinuteBackoffMs", () => {
  it("never returns less than the provider-supplied retryAfterMs", () => {
    for (let i = 0; i < 50; i++) {
      const ms = perMinuteBackoffMs(1, 12_000);
      expect(ms).toBeGreaterThanOrEqual(12_000);
      expect(ms).toBeLessThanOrEqual(12_000 * 1.15 + 1);
    }
  });

  it("never exceeds PER_MINUTE_MAX_DELAY_MS in the fallback path, at any attempt", () => {
    for (const attempt of [1, 2, 3, 5, 10, 20]) {
      for (let i = 0; i < 30; i++) {
        const ms = perMinuteBackoffMs(attempt);
        expect(ms).toBeGreaterThanOrEqual(PER_MINUTE_MIN_DELAY_MS);
        expect(ms).toBeLessThanOrEqual(PER_MINUTE_MAX_DELAY_MS);
      }
    }
  });

  it("honours a provider retryAfterMs between the max and the cap (inclusive)", () => {
    for (const target of [PER_MINUTE_MAX_DELAY_MS + 20_000, PER_MINUTE_PROVIDER_DELAY_CAP_MS]) {
      for (let i = 0; i < 50; i++) {
        const ms = perMinuteBackoffMs(1, target);
        expect(ms).toBeGreaterThanOrEqual(target);
        expect(ms).toBeLessThanOrEqual(target * 1.15 + 1);
      }
    }
  });

  it("clamps a provider retryAfterMs above the cap, and keeps jitter", () => {
    const huge = PER_MINUTE_PROVIDER_DELAY_CAP_MS * 5;
    const seen = new Set<number>();
    for (let i = 0; i < 50; i++) {
      const ms = perMinuteBackoffMs(1, huge);
      expect(ms).toBeGreaterThanOrEqual(PER_MINUTE_PROVIDER_DELAY_CAP_MS);
      expect(ms).toBeLessThanOrEqual(PER_MINUTE_PROVIDER_DELAY_CAP_MS * 1.15 + 1);
      seen.add(ms);
    }
    // Jitter must survive the clamp — otherwise every worker re-fires in sync.
    expect(seen.size).toBeGreaterThan(1);
  });

  it("floors a zero retryDelay so retries never burst back-to-back", () => {
    // Google does emit "retryDelay": "0s" → parsed as 0, must not mean "no wait".
    expect(perMinuteBackoffMs(1, 0)).toBeGreaterThanOrEqual(1000);
  });
});
