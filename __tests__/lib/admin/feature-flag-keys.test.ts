import { describe, it, expect } from "vitest";
import { KNOWN_OPERATIONAL_FLAG_KEYS, validateFlagType } from "@/lib/admin/feature-flag-keys";

describe("validateFlagType", () => {
  it("leaves unknown keys unrestricted", () => {
    expect(validateFlagType("some_custom_key", "anything")).toBeNull();
    expect(validateFlagType("some_custom_key", { nested: true })).toBeNull();
  });

  it("requires a string for string-typed keys", () => {
    expect(validateFlagType("ai_provider", "gemini")).toBeNull();
    expect(validateFlagType("ai_provider", 3)).toBe('"ai_provider" must be a string');
    expect(validateFlagType("ai_model_names", null)).toBe('"ai_model_names" must be a string');
  });

  it("requires a boolean for boolean-typed keys", () => {
    expect(validateFlagType("maintenance_mode", false)).toBeNull();
    expect(validateFlagType("maintenance_mode", "true")).toBe(
      '"maintenance_mode" must be a boolean'
    );
  });

  it("requires a positive finite number for number-typed keys, matching getFlagNumber's read rule", () => {
    expect(validateFlagType("ai_gen_limit", 5)).toBeNull();
    expect(validateFlagType("ai_gen_limit", 0.5)).toBeNull();
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, "5", null]) {
      expect(validateFlagType("ai_gen_limit", bad), String(bad)).toBe(
        '"ai_gen_limit" must be a positive number'
      );
    }
  });
});

describe("KNOWN_OPERATIONAL_FLAG_KEYS", () => {
  it("lists every key that validateFlagType restricts", () => {
    for (const key of KNOWN_OPERATIONAL_FLAG_KEYS) {
      // A value of an impossible type must be rejected for every known key.
      expect(validateFlagType(key, { impossible: true }), key).not.toBeNull();
    }
    expect(KNOWN_OPERATIONAL_FLAG_KEYS.has("maintenance_mode")).toBe(true);
    expect(KNOWN_OPERATIONAL_FLAG_KEYS.has("not_a_flag")).toBe(false);
  });
});
