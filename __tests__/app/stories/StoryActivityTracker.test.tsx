import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { StoryActivityTracker } from "@/app/stories/[slug]/StoryActivityTracker";
import { useAuthStore } from "@/store/auth";
import { useSocialStore } from "@/store/social";
import { resetActivityQueue } from "@/lib/social/post-activity";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

describe("StoryActivityTracker", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    resetActivityQueue();
    useAuthStore.setState({ accessToken: null });
    useSocialStore.setState({ streak: 0, longestStreak: 0, streakAsOf: null });
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
    expect(JSON.parse(init.body)).toMatchObject({ type: "hadith_read" });
  });

  it("bumps the streak store from the response", async () => {
    useAuthStore.setState({ accessToken: "test-token" });
    mockFetch.mockResolvedValueOnce(jsonResponse({ streak: 4, longestStreak: 5 }));

    render(<StoryActivityTracker slug="prophet-yusuf" />);

    await waitFor(() => expect(useSocialStore.getState().streak).toBe(4));
    expect(useSocialStore.getState().longestStreak).toBe(5);
  });

  it("does not throw or move the streak when the fetch keeps failing", async () => {
    vi.useFakeTimers();
    try {
      useAuthStore.setState({ accessToken: "test-token" });
      mockFetch.mockRejectedValue(new Error("network error"));

      render(<StoryActivityTracker slug="prophet-yusuf" />);

      await vi.runAllTimersAsync();

      expect(mockFetch).toHaveBeenCalled();
      expect(useSocialStore.getState().streak).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
