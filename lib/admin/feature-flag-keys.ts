type FlagType = "string" | "number" | "boolean";

// The subset of flag keys the app actually reads via getFlagString/Number/Boolean
// (see the "Operational settings" panel in the admin UI). Everything else goes
// through the generic key/JSON-value editor and has no fixed shape by design, so
// it's intentionally left unvalidated here.
const KNOWN_FLAG_TYPES: Record<string, FlagType> = {
  ai_provider: "string",
  maintenance_mode: "boolean",
  ai_gen_limit: "number",
  ai_gen_window_seconds: "number",
  mutation_limit: "number",
  mutation_window_seconds: "number",
};

/** Exported so the admin UI can warn before deleting a key with real runtime effect. */
export const KNOWN_OPERATIONAL_FLAG_KEYS: ReadonlySet<string> = new Set(
  Object.keys(KNOWN_FLAG_TYPES)
);

/**
 * Checks `value`'s JS type against a known flag key's expected type. Returns
 * an error message on mismatch, or null when the key is unknown (unrestricted)
 * or the type matches. Without this, a mistyped value (e.g. a string for
 * `ai_gen_limit`) saves successfully but is silently ignored by
 * `getFlagNumber`'s fallback the next time it's read — a confusing "my change
 * didn't do anything" instead of an error at write time.
 */
export function validateFlagType(key: string, value: unknown): string | null {
  const expected = KNOWN_FLAG_TYPES[key];
  if (!expected) return null;
  if (expected === "number") {
    return typeof value === "number" && Number.isFinite(value) ? null : `"${key}" must be a number`;
  }
  return typeof value === expected ? null : `"${key}" must be a ${expected}`;
}
