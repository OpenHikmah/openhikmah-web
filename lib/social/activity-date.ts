import { todayUTC, localDateFromOffset } from "@/lib/social/streak";

export const ACTIVITY_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The day to credit an activity to.
 *
 * This function does no trust-vetting of its own: `offsetMinutes` here is
 * already a *vetted* value by the time it arrives, decided by the caller
 * (`app/api/social/activity`'s POST handler) — the raw client-supplied
 * `tz_offset_minutes` only becomes trustworthy after that route compares it
 * against the user's stored anchor (first-sight, in-drift, or a
 * rate-limited relocation; see issue #563). A per-request offset omission
 * doesn't necessarily mean "no offset available" to that caller either — it
 * may fall back to the user's existing anchor there before calling in here.
 *
 * - With a non-null `offsetMinutes`, it's treated as authoritative: the only
 *   day we credit is the one it yields right now, so a signed-in client
 *   can't pre-credit another day by sending a mismatched `local_date`.
 * - With `offsetMinutes === null` (no vetted offset available at all — a
 *   brand new user with no anchor yet, sending no offset) we cannot place
 *   the client's calendar day, and trusting the raw `local_date` lets a
 *   crafted request (offset omitted, `local_date` = tomorrow) pre-credit a
 *   future day and inflate the streak on the next real ping. Bucket by UTC
 *   instead.
 */
export function resolveActivityDate(
  localDate: string | undefined,
  offsetMinutes: number | null
): string {
  const utc = todayUTC();
  if (!localDate || !ACTIVITY_DATE_RE.test(localDate)) return utc;

  // Reject a well-formed but non-existent calendar date ("2026-99-99",
  // "2026-02-30"): Date.parse gives NaN or silently rolls over, and the raw
  // string would otherwise hit the Postgres `date` column as a 500.
  const parsedMs = Date.parse(`${localDate}T00:00:00Z`);
  if (!Number.isFinite(parsedMs) || new Date(parsedMs).toISOString().slice(0, 10) !== localDate) {
    return utc;
  }

  if (offsetMinutes !== null) {
    const reference = localDateFromOffset(offsetMinutes);
    return localDate === reference ? localDate : reference;
  }

  return utc;
}
