import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useArmedConfirm } from "@/hooks/useArmedConfirm";

describe("useArmedConfirm", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts disarmed and does not call onConfirm on the first trigger", () => {
    const onConfirm = vi.fn();
    const { result } = renderHook(() => useArmedConfirm(onConfirm));

    expect(result.current.armed).toBe(false);
    act(() => result.current.trigger());

    expect(result.current.armed).toBe(true);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("calls onConfirm and disarms on a second trigger within the window", () => {
    const onConfirm = vi.fn();
    const { result } = renderHook(() => useArmedConfirm(onConfirm));

    act(() => result.current.trigger());
    act(() => result.current.trigger());

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(result.current.armed).toBe(false);
  });

  it("auto-disarms after the window elapses, requiring a fresh two-click sequence", () => {
    const onConfirm = vi.fn();
    const { result } = renderHook(() => useArmedConfirm(onConfirm));

    act(() => result.current.trigger());
    expect(result.current.armed).toBe(true);

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.armed).toBe(false);

    // A trigger after auto-disarm re-arms instead of confirming.
    act(() => result.current.trigger());
    expect(result.current.armed).toBe(true);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("clears the pending disarm timer on unmount", () => {
    const onConfirm = vi.fn();
    const clearTimeoutSpy = vi.spyOn(global, "clearTimeout");
    const { result, unmount } = renderHook(() => useArmedConfirm(onConfirm));

    act(() => result.current.trigger());
    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalled();
  });
});
