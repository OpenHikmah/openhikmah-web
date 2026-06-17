/**
 * Streak helpers. Streaks are tracked in UTC days: a streak is "alive" only while
 * the user's last activity was today or yesterday. Because the stored
 * `currentStreak` is reset lazily (only on the user's next activity), a broken
 * streak stays stale in the DB — so every place that *reads* a streak for display
 * or ranking must apply `effectiveStreak` to show the real value.
 */

export function todayUTC(): string {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

export function yesterdayUTC(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * The streak as it should be shown right now: the stored value while still alive
 * (last activity today or yesterday), otherwise 0 (the stored value is stale and
 * the run is broken until the next activity resets it to 1).
 */
export function effectiveStreak(
  currentStreak: number,
  lastActivityDate: string | null
): number {
  if (!lastActivityDate) return 0;
  return lastActivityDate >= yesterdayUTC() ? currentStreak : 0;
}
