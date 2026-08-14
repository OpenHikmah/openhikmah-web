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
});
