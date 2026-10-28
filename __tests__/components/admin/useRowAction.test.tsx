import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { AdminApiError } from "@/components/admin/AdminContext";
import { useRowAction } from "@/components/admin/useRowAction";

const text = { success: "Done.", failure: "Failed." };

function setup() {
  return renderHook(() => useRowAction<number>());
}

describe("useRowAction", () => {
  it("runs the action, reports success and resolves true", async () => {
    const { result } = setup();
    const action = vi.fn().mockResolvedValue(undefined);

    let done: boolean | undefined;
    await act(async () => {
      done = await result.current.run(7, action, text);
    });

    expect(done).toBe(true);
    expect(action).toHaveBeenCalledOnce();
    expect(result.current.message).toEqual({ tone: "success", text: "Done." });
    expect(result.current.busyId).toBeNull();
  });

  it("marks the row busy while the request is in flight", async () => {
    const { result } = setup();
    let release!: () => void;
    const pending = new Promise<void>((res) => (release = res));

    let running!: Promise<boolean>;
    act(() => {
      running = result.current.run(3, () => pending, text);
    });
    expect(result.current.busyId).toBe(3);

    await act(async () => {
      release();
      await running;
    });
    expect(result.current.busyId).toBeNull();
  });

  it("surfaces the API's own error message and resolves false", async () => {
    const { result } = setup();

    let done: boolean | undefined;
    await act(async () => {
      done = await result.current.run(
        1,
        () => Promise.reject(new AdminApiError(403, "Nope.")),
        text
      );
    });

    expect(done).toBe(false);
    expect(result.current.message).toEqual({ tone: "error", text: "Nope." });
  });

  it("falls back to the failure copy for an unexpected error, never showing success", async () => {
    const { result } = setup();

    await act(async () => {
      await result.current.run(1, () => Promise.reject(new Error("socket hang up")), text);
    });

    expect(result.current.message).toEqual({ tone: "error", text: "Failed." });
  });

  it("clears the previous result when a new action starts", async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.run(1, () => Promise.reject(new Error("x")), text);
    });
    expect(result.current.message?.tone).toBe("error");

    let release!: () => void;
    const pending = new Promise<void>((res) => (release = res));
    let running!: Promise<boolean>;
    act(() => {
      running = result.current.run(2, () => pending, text);
    });
    expect(result.current.message).toBeNull();

    await act(async () => {
      release();
      await running;
    });
  });
});
