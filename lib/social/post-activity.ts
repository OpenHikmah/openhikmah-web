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

// Bumped by resetActivityQueue (sign-out). A dispatch task that was already
// in flight when the reset happened captures the pre-reset value and checks it
// before mutating the queue or returning its result, so a stale event from the
// previous account can't be re-queued and a stale streak result can't be
// applied under the new session.
let generation = 0;

// Every send — a fresh event or a queue flush — runs through this one chain, so
// there is never a concurrent drain (which could submit the same queue head
// twice) and a new event never overtakes an older queued one (which would let
// the server overwrite lastActivityDate with the earlier day and break the
// streak).
let dispatch: Promise<void> = Promise.resolve();

function enqueueDispatch(task: () => Promise<void>): Promise<void> {
  const run = dispatch.then(task, task);
  dispatch = run.catch(() => {});
  return run;
}

/**
 * Deliver queued activities in FIFO order, stopping at the first failure. `gen`
 * is the caller's captured generation: if a sign-out bumps it mid-drain, this
 * stops immediately without sending or shifting — the entries now in `queue`
 * belong to a different session and must not go out under this token.
 */
async function drainQueue(accessToken: string, gen: number): Promise<void> {
  while (queue.length > 0 && generation === gen) {
    const { result } = await sendWithRetry(accessToken, queue[0]);
    if (generation !== gen || !result) return;
    queue.shift();
  }
}

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
  } catch (err) {
    // A network-level failure is retryable, but it must not vanish: a fully
    // exhausted event only lives in the in-memory queue and is lost on reload.
    console.error("postActivity: request failed", err);
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
  const queued: QueuedActivity = { ...input, localDate: clientLocalDate() };
  const gen = generation;
  let outcome: ActivityResult | null = null;

  await enqueueDispatch(async () => {
    lastToken = accessToken;
    // Older queued events go first. If the backlog can't clear, this event joins
    // the tail rather than jumping ahead of it.
    await drainQueue(accessToken, gen);
    // A sign-out landed while this task was in flight — the token and any queued
    // events belong to a session that no longer exists; drop this one silently.
    if (generation !== gen) return;
    if (queue.length > 0) {
      queue.push(queued);
      return;
    }

    const { result, exhausted } = await sendWithRetry(accessToken, queued);
    if (generation !== gen) return;
    if (result) {
      outcome = result;
      return;
    }
    if (exhausted) {
      console.error("postActivity: retries exhausted, queued for later flush", queued.type);
      queue.push(queued);
    }
  });

  return outcome;
}

/** Attempt to deliver every queued activity, FIFO, stopping at the first failure. */
export async function flushQueue(accessToken: string): Promise<void> {
  const gen = generation;
  await enqueueDispatch(async () => {
    lastToken = accessToken;
    await drainQueue(accessToken, gen);
  });
}

export function pendingActivityCount(): number {
  return queue.length;
}

/**
 * Drop every deferred activity and forget the last token. Called on sign-out
 * (see `store/auth.ts` `clearAuth`) so a queued event from one account can never
 * be flushed later with a different account's bearer token.
 */
export function resetActivityQueue(): void {
  queue.length = 0;
  lastToken = null;
  dispatch = Promise.resolve();
  generation++;
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && lastToken && queue.length > 0) {
      void flushQueue(lastToken);
    }
  });
}
