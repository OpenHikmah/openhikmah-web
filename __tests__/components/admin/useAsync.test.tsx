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

  it("keeps the last-good data on a failed reload when keepDataOnError is set", async () => {
    const loader = vi
      .fn()
      .mockResolvedValueOnce({ value: 1 })
      .mockRejectedValueOnce(new Error("boom"));
    const { result } = renderHook(() => useAsync(loader, "key", { keepDataOnError: true }));

    await waitFor(() => expect(result.current.data).toEqual({ value: 1 }));

    act(() => result.current.reload());
    await waitFor(() => expect(result.current.error).toBe("Something went wrong"));

    expect(result.current.data).toEqual({ value: 1 });
  });
});
