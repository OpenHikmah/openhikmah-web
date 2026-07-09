/**
 * Shared shape check for a stored/incoming shared-canvas node, used by both
 * `POST /api/share` (reject malformed nodes before storing) and the OG image
 * handler (guard against already-stored malformed data, e.g. from before this
 * check existed). Validates the fields both consumers actually read from
 * `verse` — `ref`, `surahName`, `translation`.
 */
export function isValidNode(node: unknown): boolean {
  if (typeof node !== "object" || node === null) return false;
  const verse = (node as { verse?: unknown }).verse;
  if (typeof verse !== "object" || verse === null) return false;
  const { ref, surahName, translation } = verse as Record<string, unknown>;
  return (
    typeof ref === "string" && typeof surahName === "string" && typeof translation === "string"
  );
}
