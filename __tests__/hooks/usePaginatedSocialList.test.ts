import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { usePaginatedSocialList } from "@/hooks/usePaginatedSocialList";

interface Item {
  id: number;
}

function page(offset: number, count: number, hasMore: boolean) {
  return {
    items: Array.from({ length: count }, (_, i): Item => ({ id: offset + i + 1 })),
    hasMore,
  };
}

describe("usePaginatedSocialList", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches the base URL on mount when enabled", async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify(page(0, 2, true)), { status: 200 }));

    const { result } = renderHook(() =>
      usePaginatedSocialList<Item>({ accessToken: "t", enabled: true, baseUrl: "/api/x" })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/x",
      expect.objectContaining({ headers: { Authorization: "Bearer t" } })
    );
    expect(result.current.items).toHaveLength(2);
    expect(result.current.hasMore).toBe(true);
  });

  it("does not fetch when disabled or missing a token", () => {
    renderHook(() =>
      usePaginatedSocialList<Item>({ accessToken: null, enabled: true, baseUrl: "/api/x" })
    );
    renderHook(() =>
      usePaginatedSocialList<Item>({ accessToken: "t", enabled: false, baseUrl: "/api/x" })
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("loadMore appends items via an offset query and preserves earlier ones", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("offset=2")) {
        return Promise.resolve(new Response(JSON.stringify(page(2, 2, false)), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify(page(0, 2, true)), { status: 200 }));
    });

    const { result } = renderHook(() =>
      usePaginatedSocialList<Item>({ accessToken: "t", enabled: true, baseUrl: "/api/x" })
    );
    await waitFor(() => expect(result.current.items).toHaveLength(2));

    await act(async () => {
      await result.current.loadMore();
    });

    expect(result.current.items).toHaveLength(4);
    expect(result.current.items.map((i) => i.id)).toEqual([1, 2, 3, 4]);
    expect(result.current.hasMore).toBe(false);
    expect(mockFetch).toHaveBeenCalledWith("/api/x?offset=2", expect.anything());
  });

  it("refresh re-requests count+1 items (the newest-first buffer) and replaces the list", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("limit=3")) {
        return Promise.resolve(new Response(JSON.stringify(page(0, 3, false)), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify(page(0, 2, true)), { status: 200 }));
    });

    const { result } = renderHook(() =>
      usePaginatedSocialList<Item>({ accessToken: "t", enabled: true, baseUrl: "/api/x" })
    );
    await waitFor(() => expect(result.current.items).toHaveLength(2));

    await act(async () => {
      await result.current.refresh();
    });

    expect(mockFetch).toHaveBeenCalledWith("/api/x?limit=3", expect.anything());
    expect(result.current.items).toHaveLength(3);
  });

  it("sets error and clears loading on a non-ok response, without touching items", async () => {
    mockFetch.mockResolvedValue(new Response(null, { status: 500 }));

    const { result } = renderHook(() =>
      usePaginatedSocialList<Item>({ accessToken: "t", enabled: true, baseUrl: "/api/x" })
    );

    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.loading).toBe(false);
    expect(result.current.items).toEqual([]);
  });

  it("a request cancelled via AbortController does not set an error", async () => {
    // Simulates what a real `fetch` does when its signal fires: rejects with
    // a DOMException named "AbortError". A superseded (cancelled) request
    // must be treated as neither success nor failure — not surfaced as an
    // error banner just because it lost the race to a newer request.
    const abortError = Object.assign(new Error("The operation was aborted"), {
      name: "AbortError",
    });
    mockFetch.mockRejectedValue(abortError);

    const { result } = renderHook(() =>
      usePaginatedSocialList<Item>({ accessToken: "t", enabled: true, baseUrl: "/api/x" })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(false);
    expect(result.current.items).toEqual([]);
  });

  it("calls onData with each successfully replaced page", async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify(page(0, 2, false)), { status: 200 }));
    const onData = vi.fn();

    renderHook(() =>
      usePaginatedSocialList<Item>({ accessToken: "t", enabled: true, baseUrl: "/api/x", onData })
    );

    await waitFor(() => expect(onData).toHaveBeenCalledWith(page(0, 2, false).items));
  });
});
