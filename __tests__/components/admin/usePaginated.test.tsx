import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { usePaginated, type Page } from "@/components/admin/usePaginated";
import { AdminApiError } from "@/components/admin/AdminContext";

describe("usePaginated", () => {
  it("loads page 0 on mount and exposes rows + hasMore + extra", async () => {
    const fetchPage = vi.fn(async (): Promise<Page<number, { total: number }>> => ({
      rows: [1, 2, 3],
      hasMore: true,
      extra: { total: 99 },
    }));
    const { result } = renderHook(() => usePaginated(fetchPage, "k"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.rows).toEqual([1, 2, 3]);
    expect(result.current.hasMore).toBe(true);
    expect(result.current.extra).toEqual({ total: 99 });
    expect(fetchPage).toHaveBeenCalledWith({ offset: 0 });
  });

  it("loadMore appends the next page keyed by current row count", async () => {
    const fetchPage = vi.fn(async ({ offset }: { offset: number }): Promise<Page<number>> => {
      if (offset === 0) return { rows: [1, 2], hasMore: true };
      return { rows: [3, 4], hasMore: false };
    });
    const { result } = renderHook(() => usePaginated(fetchPage, "k"));
    await waitFor(() => expect(result.current.rows).toEqual([1, 2]));

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.rows).toEqual([1, 2, 3, 4]));
    expect(fetchPage).toHaveBeenLastCalledWith({ offset: 2 });
    expect(result.current.hasMore).toBe(false);
  });

  it("reload resets to page 0 and drops appended rows", async () => {
    let call = 0;
    const fetchPage = vi.fn(async ({ offset }: { offset: number }): Promise<Page<number>> => {
      if (offset > 0) return { rows: [99], hasMore: false };
      call += 1;
      return { rows: [call], hasMore: true };
    });
    const { result } = renderHook(() => usePaginated(fetchPage, "k"));
    await waitFor(() => expect(result.current.rows).toEqual([1]));
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.rows).toEqual([1, 99]));

    act(() => result.current.reload());
    await waitFor(() => expect(result.current.rows).toEqual([2]));
  });

  it("surfaces a page-0 AdminApiError message and clears rows", async () => {
    const fetchPage = vi
      .fn<() => Promise<Page<number>>>()
      .mockResolvedValueOnce({ rows: [1], hasMore: false })
      .mockRejectedValueOnce(new AdminApiError(500, "boom"));
    const { result, rerender } = renderHook(({ k }) => usePaginated(fetchPage, k), {
      initialProps: { k: "a" },
    });
    await waitFor(() => expect(result.current.rows).toEqual([1]));

    rerender({ k: "b" });
    await waitFor(() => expect(result.current.error).toBe("boom"));
    expect(result.current.rows).toEqual([]);
  });

  it("clears loadingMore when a reload supersedes an in-flight append", async () => {
    let releaseAppend!: () => void;
    const fetchPage = vi.fn(async ({ offset }: { offset: number }): Promise<Page<number>> => {
      if (offset === 0) return { rows: [1], hasMore: true };
      await new Promise<void>((r) => {
        releaseAppend = r;
      });
      return { rows: [2], hasMore: true };
    });
    const { result } = renderHook(() => usePaginated(fetchPage, "k"));
    await waitFor(() => expect(result.current.rows).toEqual([1]));

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.loadingMore).toBe(true));

    act(() => result.current.reload());
    await waitFor(() => expect(result.current.rows).toEqual([1]));

    // The stale append resolves after the reload — its finally is guarded out,
    // so loadingMore must already be false and loadMore() must work again.
    act(() => releaseAppend());
    await waitFor(() => expect(result.current.loadingMore).toBe(false));
    act(() => result.current.loadMore());
    expect(fetchPage).toHaveBeenLastCalledWith({ offset: 1 });
  });

  it("keeps rows on a failed loadMore and flags loadMoreError", async () => {
    const fetchPage = vi.fn(async ({ offset }: { offset: number }): Promise<Page<number>> => {
      if (offset === 0) return { rows: [1, 2], hasMore: true };
      throw new AdminApiError(500, "nope");
    });
    const { result } = renderHook(() => usePaginated(fetchPage, "k"));
    await waitFor(() => expect(result.current.rows).toEqual([1, 2]));

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.loadMoreError).toBe(true));
    expect(result.current.rows).toEqual([1, 2]);
  });
});
