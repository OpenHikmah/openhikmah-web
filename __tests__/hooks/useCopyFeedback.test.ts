import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCopyFeedback } from "@/hooks/useCopyFeedback";

const writeText = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  writeText.mockReset();
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useCopyFeedback", () => {
  it("copies the text, flags copied, then clears the flag after resetMs", async () => {
    writeText.mockResolvedValue(undefined);
    const { result } = renderHook(() => useCopyFeedback(1500));

    let ok = false;
    await act(async () => {
      ok = await result.current.copy("https://example.test/share");
    });
    expect(ok).toBe(true);
    expect(writeText).toHaveBeenCalledWith("https://example.test/share");
    expect(result.current.copied).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1499);
    });
    expect(result.current.copied).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(result.current.copied).toBe(false);
  });

  it("defaults to a 2 second flash", async () => {
    writeText.mockResolvedValue(undefined);
    const { result } = renderHook(() => useCopyFeedback());
    await act(async () => {
      await result.current.copy("x");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1999);
    });
    expect(result.current.copied).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(result.current.copied).toBe(false);
  });

  it("restarts the flash window when copying again before it elapses", async () => {
    writeText.mockResolvedValue(undefined);
    const { result } = renderHook(() => useCopyFeedback(1000));
    await act(async () => {
      await result.current.copy("a");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    await act(async () => {
      await result.current.copy("b");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    expect(result.current.copied).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(result.current.copied).toBe(false);
  });

  it("fails silently with false when the clipboard rejects, leaving copied unset", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    const { result } = renderHook(() => useCopyFeedback());
    let ok = true;
    await act(async () => {
      ok = await result.current.copy("x");
    });
    expect(ok).toBe(false);
    expect(result.current.copied).toBe(false);
  });

  it("clears its pending timer on unmount", async () => {
    writeText.mockResolvedValue(undefined);
    const { result, unmount } = renderHook(() => useCopyFeedback());
    await act(async () => {
      await result.current.copy("x");
    });
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
