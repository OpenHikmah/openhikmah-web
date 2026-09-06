import { todayUTC, localDateFromOffset } from "@/lib/social/streak";

export const ACTIVITY_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The day to credit an activity to.
 *
 * - With a client `tz_offset_minutes`, the offset is authoritative: the only day
 *   we credit is the one the offset yields right now, so a signed-in client
 *   can't pre-credit another day by sending a mismatched `local_date`.
 * - Without an offset we cannot place the client's calendar day at all, and
 *   trusting the raw `local_date` lets a crafted request (offset omitted,
 *   `local_date` = tomorrow) pre-credit a future day and inflate the streak on
 *   the next real ping. Bucket by UTC instead — the real client always sends its
 *   offset (`lib/social/post-activity.ts`).
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
