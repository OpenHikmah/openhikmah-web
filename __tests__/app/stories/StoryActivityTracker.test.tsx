import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { StoryActivityTracker } from "@/app/stories/[slug]/StoryActivityTracker";
import { useAuthStore } from "@/store/auth";
import { useSocialStore } from "@/store/social";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function jsonResponse(body: unknown) {
  return { ok: true, json: async () => body };
}

describe("StoryActivityTracker", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    useAuthStore.setState({ accessToken: null });
    useSocialStore.setState({ streak: 0, longestStreak: 0 });
  });

  it("does not fetch when there is no access token", () => {
    render(<StoryActivityTracker slug="prophet-yusuf" />);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("POSTs a hadith_read activity ping with the bearer token when signed in", async () => {
    useAuthStore.setState({ accessToken: "test-token" });
    mockFetch.mockResolvedValueOnce(jsonResponse({ streak: 4, longestStreak: 4 }));

    render(<StoryActivityTracker slug="prophet-yusuf" />);

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("/api/social/activity");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer test-token");
    expect(JSON.parse(init.body)).toEqual({ type: "hadith_read" });
  });

  it("bumps the streak store from the response", async () => {
    useAuthStore.setState({ accessToken: "test-token" });
    mockFetch.mockResolvedValueOnce(jsonResponse({ streak: 4, longestStreak: 5 }));

    render(<StoryActivityTracker slug="prophet-yusuf" />);

    await waitFor(() => expect(useSocialStore.getState().streak).toBe(4));
    expect(useSocialStore.getState().longestStreak).toBe(5);
  });

  it("does not throw when the fetch fails", async () => {
    useAuthStore.setState({ accessToken: "test-token" });
    mockFetch.mockRejectedValueOnce(new Error("network error"));

    render(<StoryActivityTracker slug="prophet-yusuf" />);

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    expect(useSocialStore.getState().streak).toBe(0);
  });
});
