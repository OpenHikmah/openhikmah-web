import { describe, it, expect, vi, afterEach } from "vitest";
import { interruptibleSleep } from "@/lib/infra/sleep";

afterEach(() => {
  vi.useRealTimers();
});

describe("interruptibleSleep", () => {
  it("resolves after the delay", async () => {
    vi.useFakeTimers();
    let done = false;
    const p = interruptibleSleep(1000).then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await p;
    expect(done).toBe(true);
  });

  it("rejects immediately, without scheduling a timer, when the signal is already aborted", async () => {
    vi.useFakeTimers();
    const ac = new AbortController();
    ac.abort(new Error("stopped"));
    await expect(interruptibleSleep(1000, ac.signal)).rejects.toThrow("stopped");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects with the abort reason when aborted mid-sleep and clears the timer", async () => {
    vi.useFakeTimers();
    const ac = new AbortController();
    const p = interruptibleSleep(60_000, ac.signal);
    const assertion = expect(p).rejects.toThrow("cancelled by admin");
    ac.abort(new Error("cancelled by admin"));
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("falls back to a generic error when the signal carries no reason", async () => {
    vi.useFakeTimers();
    const signal = { aborted: true, reason: undefined } as unknown as AbortSignal;
    await expect(interruptibleSleep(10, signal)).rejects.toThrow("aborted");
  });

  it("removes its abort listener once the delay elapses", async () => {
    vi.useFakeTimers();
    const ac = new AbortController();
    const remove = vi.spyOn(ac.signal, "removeEventListener");
    const p = interruptibleSleep(10, ac.signal);
    await vi.advanceTimersByTimeAsync(10);
    await p;
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
  });
});
