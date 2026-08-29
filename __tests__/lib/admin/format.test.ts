import { describe, it, expect } from "vitest";
import { formatInfraResult } from "@/lib/admin/format";

describe("formatInfraResult", () => {
  it("summarises flush-tokens with a pluralised count", () => {
    expect(formatInfraResult({ action: "flush-tokens", cleared: 12 })).toBe(
      "Cleared 12 cached tokens."
    );
    expect(formatInfraResult({ action: "flush-tokens", cleared: 1 })).toBe(
      "Cleared 1 cached token."
    );
    expect(formatInfraResult({ action: "flush-tokens" })).toBe("Cleared 0 cached tokens.");
  });

  it("summarises flush-jwks", () => {
    expect(formatInfraResult({ action: "flush-jwks", ok: true })).toBe("JWKS cache flushed.");
  });

  it("summarises reset-ratelimits with a pluralised count", () => {
    expect(formatInfraResult({ action: "reset-ratelimits", deleted: 40 })).toBe(
      "Deleted 40 rate-limit rows."
    );
    expect(formatInfraResult({ action: "reset-ratelimits", deleted: 1 })).toBe(
      "Deleted 1 rate-limit row."
    );
  });

  it("falls back to a generic message for an unknown action", () => {
    expect(formatInfraResult({ action: "something-else" })).toBe("Done.");
  });
});
