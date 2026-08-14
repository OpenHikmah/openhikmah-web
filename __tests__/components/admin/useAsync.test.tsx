import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useAsync } from "@/components/admin/useAsync";

describe("useAsync", () => {
  it("clears data on a failed reload by default", async () => {
    const loader = vi
      .fn()
      .mockResolvedValueOnce({ value: 1 })
      .mockRejectedValueOnce(new Error("boom"));
    const { result } = renderHook(() => useAsync(loader, "key"));

    await waitFor(() => expect(result.current.data).toEqual({ value: 1 }));

    act(() => result.current.reload());
    await waitFor(() => expect(result.current.error).toBe("Something went wrong"));

    expect(result.current.data).toBeNull();
  });

  it("keeps the last-good data on a failed reload when reload({ keepDataOnError: true }) is used", async () => {
    const loader = vi
      .fn()
      .mockResolvedValueOnce({ value: 1 })
      .mockRejectedValueOnce(new Error("boom"));
    const { result } = renderHook(() => useAsync(loader, "key"));

    await waitFor(() => expect(result.current.data).toEqual({ value: 1 }));

    act(() => result.current.reload({ keepDataOnError: true }));
    await waitFor(() => expect(result.current.error).toBe("Something went wrong"));

    expect(result.current.data).toEqual({ value: 1 });
  });

  it("is per-call, not sticky: a later plain reload() still clears data on failure", async () => {
    const loader = vi
      .fn()
      .mockResolvedValueOnce({ value: 1 })
      .mockRejectedValueOnce(new Error("boom 1"))
      .mockRejectedValueOnce(new Error("boom 2"));
    const { result } = renderHook(() => useAsync(loader, "key"));

    await waitFor(() => expect(result.current.data).toEqual({ value: 1 }));

    act(() => result.current.reload({ keepDataOnError: true }));
    await waitFor(() => expect(result.current.error).toBe("Something went wrong"));
    expect(result.current.data).toEqual({ value: 1 });

    act(() => result.current.reload());
    await waitFor(() => expect(result.current.data).toBeNull());
  });

  it("ignores a superseded reload's outcome entirely, even if a later reload changed keepDataOnError before it settles", async () => {
    // keepDataOnErrorRef is shared mutable state read at settle-time, not
    // captured at reload-call-time — but that's safe here because any reload
    // that changes it also bumps `tick`, which cancels (via the effect's
    // `active` flag) whichever request was previously in flight. A cancelled
    // request's .catch bails before ever consulting the ref, so it can never
    // apply a keepDataOnError value that wasn't the one in effect when *it*
    // was started.
    function deferred<T>() {
      let resolve!: (v: T) => void;
      let reject!: (e: unknown) => void;
      const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    }
    const initial = deferred<{ v: number }>();
    const plainReload = deferred<{ v: number }>();
    const pollReload = deferred<{ v: number }>();
    const loader = vi
      .fn()
      .mockReturnValueOnce(initial.promise)
      .mockReturnValueOnce(plainReload.promise)
      .mockReturnValueOnce(pollReload.promise);

    const { result } = renderHook(() => useAsync(loader, "key"));
    await act(async () => initial.resolve({ v: 0 }));
    await waitFor(() => expect(result.current.data).toEqual({ v: 0 }));

    // A plain reload() starts (would clear on error) and stays pending...
    act(() => result.current.reload());
    await waitFor(() => expect(loader).toHaveBeenCalledTimes(2));

    // ...then a poll reload({ keepDataOnError: true }) supersedes it before
    // it settles, and fails.
    act(() => result.current.reload({ keepDataOnError: true }));
    await waitFor(() => expect(loader).toHaveBeenCalledTimes(3));
    await act(async () => {
      pollReload.reject(new Error("poll failed"));
      await Promise.resolve();
    });
    expect(result.current.data).toEqual({ v: 0 }); // kept, per the poll's own option

    // The superseded plain reload finally settles too (also fails). If it
    // read the *current* (poll's) ref value, data would incorrectly stay;
    // instead its outcome must be ignored entirely since it was cancelled.
    await act(async () => {
      plainReload.reject(new Error("stale plain reload failed"));
      await Promise.resolve();
    });
    expect(result.current.data).toEqual({ v: 0 });
    expect(result.current.error).toBe("Something went wrong");
  });

  it("doesn't let a retaining reload for one cacheKey leak into a later cacheKey's failed fetch", async () => {
    const loader = vi
      .fn()
      .mockResolvedValueOnce({ value: "a" }) // initial load for key "a"
      .mockRejectedValueOnce(new Error("poll failed")) // reload({ keepDataOnError: true }) for key "a"
      .mockRejectedValueOnce(new Error("b failed")); // initial load for key "b", after switching keys
    const { result, rerender } = renderHook(({ cacheKey }) => useAsync(loader, cacheKey), {
      initialProps: { cacheKey: "a" },
    });

    await waitFor(() => expect(result.current.data).toEqual({ value: "a" }));

    act(() => result.current.reload({ keepDataOnError: true }));
    await waitFor(() => expect(result.current.error).toBe("Something went wrong"));
    expect(result.current.data).toEqual({ value: "a" }); // retained, as intended for key "a"

    // Switch to a different resource entirely (no reload() call — a plain
    // cacheKey change). Its own fetch fails; without the fix this would
    // incorrectly keep showing key "a"'s stale data.
    rerender({ cacheKey: "b" });
    await waitFor(() => expect(loader).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(result.current.data).toBeNull());
  });
});
