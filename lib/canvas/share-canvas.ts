// Stored, then rendered in the canvas and the OG card — not a size limit
// enforced anywhere else, since the 512 KB whole-body cap doesn't bound any
// single field. Generous enough for real verse text/translations.
const MAX_FIELD_LENGTH = 2000;

/**
 * Shared shape check for a stored/incoming shared-canvas node, used by both
 * `POST /api/share` (reject malformed nodes before storing) and the OG image
 * handler (guard against already-stored malformed data, e.g. from before this
 * check existed). Validates the fields both consumers actually read from
 * `verse` — `ref`, `surahName`, `translation` — including a length cap.
 */
export function isValidNode(node: unknown): boolean {
  if (typeof node !== "object" || node === null) return false;
  const verse = (node as { verse?: unknown }).verse;
  if (typeof verse !== "object" || verse === null) return false;
  const { ref, surahName, translation } = verse as Record<string, unknown>;
  return isValidField(ref) && isValidField(surahName) && isValidField(translation);
}

function isValidField(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_FIELD_LENGTH;
}
