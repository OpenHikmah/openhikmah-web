import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  postActivity,
  flushQueue,
  pendingActivityCount,
  resetActivityQueue,
} from "@/lib/social/post-activity";

function okJson(body: unknown) {
  return { ok: true, status: 200, json: () => Promise.resolve(body) };
}
function errStatus(status: number) {
  return { ok: false, status, json: () => Promise.resolve({ error: "nope" }) };
}

describe("postActivity", () => {
  beforeEach(() => {
    resetActivityQueue();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("sends the local calendar day and tz offset in the body", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(okJson({ streak: 3, longestStreak: 5, activityDate: "2026-08-28" }));
    vi.stubGlobal("fetch", fetchMock);

    await postActivity("tok", { type: "verse_added", verseRef: "2:255" });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.type).toBe("verse_added");
    expect(body.verse_ref).toBe("2:255");
    expect(body.local_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(typeof body.tz_offset_minutes).toBe("number");
  });

  it("returns the parsed result on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(okJson({ streak: 4, longestStreak: 6, activityDate: "2026-08-28" }))
    );
    const result = await postActivity("tok", { type: "connection_made" });
    expect(result).toEqual({ streak: 4, longestStreak: 6, activityDate: "2026-08-28" });
  });

  it("retries a 500 then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errStatus(500))
      .mockResolvedValueOnce(okJson({ streak: 1, longestStreak: 1, activityDate: "2026-08-28" }));
    vi.stubGlobal("fetch", fetchMock);

    const p = postActivity("tok", { type: "verse_added" });
    await vi.runAllTimersAsync();
    const result = await p;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result?.streak).toBe(1);
    expect(pendingActivityCount()).toBe(0);
  });

  it("gives up after 3 attempts and enqueues the activity", async () => {
    const fetchMock = vi.fn().mockResolvedValue(errStatus(503));
    vi.stubGlobal("fetch", fetchMock);

    const p = postActivity("tok", { type: "verse_added", verseRef: "1:1" });
    await vi.runAllTimersAsync();
    const result = await p;

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result).toBeNull();
    expect(pendingActivityCount()).toBe(1);
  });

  it("does not retry a 400 and does not enqueue it", async () => {
    const fetchMock = vi.fn().mockResolvedValue(errStatus(400));
    vi.stubGlobal("fetch", fetchMock);

    const result = await postActivity("tok", { type: "bogus" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toBeNull();
    expect(pendingActivityCount()).toBe(0);
  });

  it("retries on a network error (fetch rejects)", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(okJson({ streak: 2, longestStreak: 2, activityDate: "2026-08-28" }));
    vi.stubGlobal("fetch", fetchMock);

    const p = postActivity("tok", { type: "verse_added" });
    await vi.runAllTimersAsync();
    const result = await p;

    expect(result?.streak).toBe(2);
  });

  it("never rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom")));
    const p = postActivity("tok", { type: "verse_added" });
    await vi.runAllTimersAsync();
    await expect(p).resolves.toBeNull();
  });

  it("flushQueue drains an enqueued item after a later success", async () => {
    const fetchMock = vi.fn().mockResolvedValue(errStatus(500));
    vi.stubGlobal("fetch", fetchMock);
    const p = postActivity("tok", { type: "verse_added", verseRef: "1:1" });
    await vi.runAllTimersAsync();
    await p;
    expect(pendingActivityCount()).toBe(1);

    fetchMock.mockResolvedValue(
      okJson({ streak: 9, longestStreak: 9, activityDate: "2026-08-28" })
    );
    await flushQueue("tok");
    await vi.runAllTimersAsync();

    expect(pendingActivityCount()).toBe(0);
  });

  it("sends a queued older event before a newly submitted one", async () => {
    const fetchMock = vi.fn().mockResolvedValue(errStatus(500));
    vi.stubGlobal("fetch", fetchMock);
    const p1 = postActivity("tok", { type: "verse_added", verseRef: "1:1" });
    await vi.runAllTimersAsync();
    await p1;
    expect(pendingActivityCount()).toBe(1);

    const sent: string[] = [];
    fetchMock.mockImplementation((_url: string, init: { body: string }) => {
      sent.push(JSON.parse(init.body).verse_ref);
      return Promise.resolve(okJson({ streak: 1, longestStreak: 1, activityDate: "2026-08-28" }));
    });

    const p2 = postActivity("tok", { type: "verse_added", verseRef: "2:2" });
    await vi.runAllTimersAsync();
    await p2;

    expect(sent).toEqual(["1:1", "2:2"]);
    expect(pendingActivityCount()).toBe(0);
  });

  it("resetActivityQueue drops deferred events so they can't flush under a new token", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(errStatus(503)));
    const p = postActivity("tok-a", { type: "verse_added", verseRef: "1:1" });
    await vi.runAllTimersAsync();
    await p;
    expect(pendingActivityCount()).toBe(1);

    resetActivityQueue();
    expect(pendingActivityCount()).toBe(0);

    const fetchMock = vi
      .fn()
      .mockResolvedValue(okJson({ streak: 1, longestStreak: 1, activityDate: "2026-08-28" }));
    vi.stubGlobal("fetch", fetchMock);
    await flushQueue("tok-b");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a reset while a POST is in flight discards its result and doesn't re-queue it", async () => {
    let resolveFetch: (v: unknown) => void = () => {};
    const inFlight = new Promise((resolve) => {
      resolveFetch = resolve;
    });
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(inFlight));

    const p = postActivity("tok-a", { type: "verse_added", verseRef: "1:1" });

    resetActivityQueue();
    resolveFetch(okJson({ streak: 7, longestStreak: 7, activityDate: "2026-08-28" }));

    await expect(p).resolves.toBeNull();
    expect(pendingActivityCount()).toBe(0);
  });

  it("a pre-reset drain that resolves later can't consume or send the new session's queued entry", async () => {
    // Session A: leave one entry in the queue.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(errStatus(503)));
    const pa = postActivity("tok-a", { type: "verse_added", verseRef: "a:1" });
    await vi.runAllTimersAsync();
    await pa;
    expect(pendingActivityCount()).toBe(1);

    // Start a flush for A whose in-flight send hangs mid-drain.
    let resolveHang: (v: unknown) => void = () => {};
    const hang = new Promise((resolve) => {
      resolveHang = resolve;
    });
    const fetchA = vi.fn().mockReturnValue(hang);
    vi.stubGlobal("fetch", fetchA);
    const flush = flushQueue("tok-a");
    await vi.advanceTimersByTimeAsync(0);

    // Sign-out, then session B queues its own activity.
    resetActivityQueue();
    expect(pendingActivityCount()).toBe(0);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(errStatus(503)));
    const pb = postActivity("tok-b", { type: "verse_added", verseRef: "b:1" });
    await vi.runAllTimersAsync();
    await pb;
    expect(pendingActivityCount()).toBe(1);

    // A's drain finally resolves — it must not touch B's entry.
    resolveHang(okJson({ streak: 1, longestStreak: 1, activityDate: "2026-08-28" }));
    await flush;
    await vi.runAllTimersAsync();

    expect(pendingActivityCount()).toBe(1);
    const sentBUnderTokenA = fetchA.mock.calls.some(
      (c) => JSON.parse(c[1].body).verse_ref === "b:1"
    );
    expect(sentBUnderTokenA).toBe(false);
  });
});
