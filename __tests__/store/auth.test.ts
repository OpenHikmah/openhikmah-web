import { describe, it, expect, beforeEach, vi } from "vitest";
import { useAuthStore } from "@/store/auth";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("auth store", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    localStorage.clear();
    useAuthStore.setState({ accessToken: null, bookmarks: [] });
  });

  it("initial state has null token and empty bookmarks", () => {
    const s = useAuthStore.getState();
    expect(s.accessToken).toBeNull();
    expect(s.bookmarks).toEqual([]);
  });

  it("setTokens stores the access token", () => {
    useAuthStore.getState().setTokens("access-abc");
    expect(useAuthStore.getState().accessToken).toBe("access-abc");
  });

  it("clearAuth resets token and bookmarks", () => {
    useAuthStore.getState().setTokens("tok");
    useAuthStore.setState({ bookmarks: ["2:255"] });
    useAuthStore.getState().clearAuth();
    const s = useAuthStore.getState();
    expect(s.accessToken).toBeNull();
    expect(s.bookmarks).toEqual([]);
  });

  it("isBookmarked returns false when not bookmarked", () => {
    expect(useAuthStore.getState().isBookmarked("2:255")).toBe(false);
  });

  it("isBookmarked returns true after bookmark added", () => {
    useAuthStore.setState({ bookmarks: ["2:255", "1:1"] });
    expect(useAuthStore.getState().isBookmarked("2:255")).toBe(true);
    expect(useAuthStore.getState().isBookmarked("1:1")).toBe(true);
    expect(useAuthStore.getState().isBookmarked("3:18")).toBe(false);
  });

  it("toggleBookmark adds a ref when not bookmarked (no token)", () => {
    useAuthStore.getState().toggleBookmark("2:255");
    expect(useAuthStore.getState().bookmarks).toContain("2:255");
  });

  it("toggleBookmark removes a ref when already bookmarked (no token)", () => {
    useAuthStore.setState({ bookmarks: ["2:255"] });
    useAuthStore.getState().toggleBookmark("2:255");
    expect(useAuthStore.getState().bookmarks).not.toContain("2:255");
  });

  it("toggleBookmark is idempotent for add (no duplicates)", () => {
    useAuthStore.getState().toggleBookmark("2:255");
    useAuthStore.getState().toggleBookmark("2:255"); // should remove
    expect(useAuthStore.getState().bookmarks).not.toContain("2:255");
  });

  it("toggleBookmark calls POST /api/bookmarks when token present", () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    useAuthStore.setState({ accessToken: "token-123" });
    useAuthStore.getState().toggleBookmark("3:18");
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/bookmarks",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("toggleBookmark calls DELETE /api/bookmarks/ref when removing with token", () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    useAuthStore.setState({ accessToken: "token-123", bookmarks: ["3:18"] });
    useAuthStore.getState().toggleBookmark("3:18");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/bookmarks/"),
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("toggleBookmark rolls back optimistic add if API fails", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    useAuthStore.setState({ accessToken: "token-123", bookmarks: [] });
    useAuthStore.getState().toggleBookmark("5:1");

    // Optimistic: should be added immediately
    expect(useAuthStore.getState().bookmarks).toContain("5:1");

    // Wait for the API call to resolve and rollback
    await new Promise((r) => setTimeout(r, 0));
    expect(useAuthStore.getState().bookmarks).not.toContain("5:1");
  });

  it("toggleBookmark rolls back optimistic remove if API fails", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    useAuthStore.setState({ accessToken: "token-123", bookmarks: ["5:1"] });
    useAuthStore.getState().toggleBookmark("5:1");

    // Optimistic: should be removed immediately
    expect(useAuthStore.getState().bookmarks).not.toContain("5:1");

    // Wait for the API call to resolve and rollback
    await new Promise((r) => setTimeout(r, 0));
    expect(useAuthStore.getState().bookmarks).toContain("5:1");
  });

  it("loadRemoteBookmarks does nothing when no token", async () => {
    await useAuthStore.getState().loadRemoteBookmarks();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("loadRemoteBookmarks fetches and sets bookmarks", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ refs: ["2:255", "112:1"] }),
    });
    useAuthStore.setState({ accessToken: "tok" });
    await useAuthStore.getState().loadRemoteBookmarks();
    expect(useAuthStore.getState().bookmarks).toEqual(["2:255", "112:1"]);
  });

  it("loadRemoteBookmarks does nothing on API failure", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    useAuthStore.setState({ accessToken: "tok", bookmarks: ["3:1"] });
    await useAuthStore.getState().loadRemoteBookmarks();
    expect(useAuthStore.getState().bookmarks).toEqual(["3:1"]); // unchanged
  });
});
