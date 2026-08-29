/**
 * Streak helpers. A streak is "alive" only while the user's last activity was
 * their local today or local yesterday. The day boundary is the user's own
 * calendar day, not UTC: `activityDate` / `lastActivityDate` are the local
 * `YYYY-MM-DD` the client reported (see `app/api/social/activity` POST), and
 * every reader decays a stale streak against the same local calendar using the
 * user's stored `timezoneOffsetMinutes` (null → UTC, for rows written before the
 * offset was ever recorded).
 *
 * Because the stored `currentStreak` is reset lazily (only on the user's next
 * activity), a broken streak stays stale in the DB — so every place that *reads*
 * a streak for display or ranking must apply `effectiveStreak`.
 */

export function todayUTC(): string {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

export function yesterdayUTC(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** The calendar day before `dateStr` ("YYYY-MM-DD" → "YYYY-MM-DD"). */
export function previousDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * The calendar date right now in a timezone `offsetMinutes` east of UTC
 * (UTC+3 → `180`). A null offset falls back to UTC.
 */
export function localDateFromOffset(offsetMinutes: number | null, now: Date = new Date()): string {
  const shifted = new Date(now.getTime() + (offsetMinutes ?? 0) * 60_000);
  return shifted.toISOString().slice(0, 10);
}

/**
 * The streak as it should be shown right now: the stored value while still alive
 * (last activity on the user's local today or local yesterday), otherwise 0 (the
 * stored value is stale and the run is broken until the next activity resets it).
 */
export function effectiveStreak(
  currentStreak: number,
  lastActivityDate: string | null,
  offsetMinutes: number | null = 0
): number {
  if (!lastActivityDate) return 0;
  const localYesterday = previousDay(localDateFromOffset(offsetMinutes));
  return lastActivityDate >= localYesterday ? currentStreak : 0;
}
