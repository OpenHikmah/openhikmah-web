/**
 * Client-side activity POSTs with retry + an in-memory failure queue.
 *
 * Activity tracking is non-blocking, but a dropped POST silently breaks the
 * user's streak the next day, so a transient failure (network blip, a 429 from
 * the per-user bucket, a 5xx) is retried a few times and, if it still fails,
 * queued and flushed on the next successful POST or when the tab becomes
 * visible again. The queue is in-memory only — a full reload before a flush
 * loses it, which is rare and acceptable.
 */

export interface ActivityInput {
  type: string;
  verseRef?: string | null;
}

export interface ActivityResult {
  streak: number;
  longestStreak: number;
  activityDate: string;
}

interface QueuedActivity extends ActivityInput {
  localDate: string;
}

const RETRY_BACKOFF_MS = [0, 1000, 3000];
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

const queue: QueuedActivity[] = [];
let lastToken: string | null = null;

/** The client's current local calendar day, "YYYY-MM-DD". */
export function clientLocalDate(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Minutes east of UTC for the client's timezone (UTC+3 → 180). */
export function clientTzOffsetMinutes(now: Date = new Date()): number {
  return -now.getTimezoneOffset();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendOnce(
  accessToken: string,
  input: QueuedActivity
): Promise<{ result: ActivityResult | null; retryable: boolean }> {
  try {
    const res = await fetch("/api/social/activity", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        type: input.type,
        verse_ref: input.verseRef ?? undefined,
        local_date: input.localDate,
        tz_offset_minutes: clientTzOffsetMinutes(),
      }),
    });
    if (res.ok) {
      const data = (await res.json()) as ActivityResult;
      return { result: data, retryable: false };
    }
    return { result: null, retryable: RETRYABLE_STATUS.has(res.status) };
  } catch {
    return { result: null, retryable: true };
  }
}

async function sendWithRetry(
  accessToken: string,
  input: QueuedActivity
): Promise<{ result: ActivityResult | null; exhausted: boolean }> {
  for (let attempt = 0; attempt < RETRY_BACKOFF_MS.length; attempt++) {
    if (attempt > 0) {
      await delay(RETRY_BACKOFF_MS[attempt] + Math.random() * 250);
    }
    const { result, retryable } = await sendOnce(accessToken, input);
    if (result) return { result, exhausted: false };
    if (!retryable) return { result: null, exhausted: false };
  }
  return { result: null, exhausted: true };
}

/**
 * POST an activity event. Resolves with the server's streak result, or null if
 * it could not be delivered (a non-retryable rejection, or exhausted retries —
 * in which case the event is queued for a later flush). Never rejects.
 */
export async function postActivity(
  accessToken: string,
  input: ActivityInput
): Promise<ActivityResult | null> {
  lastToken = accessToken;
  const queued: QueuedActivity = { ...input, localDate: clientLocalDate() };

  const { result, exhausted } = await sendWithRetry(accessToken, queued);
  if (result) {
    void flushQueue(accessToken);
    return result;
  }

  if (exhausted) queue.push(queued);
  return null;
}

/** Attempt to deliver every queued activity, FIFO, stopping at the first failure. */
export async function flushQueue(accessToken: string): Promise<void> {
  lastToken = accessToken;
  while (queue.length > 0) {
    const next = queue[0];
    const { result } = await sendWithRetry(accessToken, next);
    if (!result) return;
    queue.shift();
  }
}

export function pendingActivityCount(): number {
  return queue.length;
}

export function __resetActivityQueue(): void {
  queue.length = 0;
  lastToken = null;
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && lastToken && queue.length > 0) {
      void flushQueue(lastToken);
    }
  });
}
