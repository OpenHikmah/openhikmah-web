import { act } from "@testing-library/react";
import { renderWithIntl } from "../../test-utils/render-with-intl";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/canvas",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

import { Header } from "@/components/layout/Header";
import { useAuthStore } from "@/store/auth";
import { useSocialStore } from "@/store/social";

describe("Header — polling badges survive a transient failure", () => {
  const mockFetch = vi.fn();
  const previousAuth = useAuthStore.getState();
  const previousSocial = useSocialStore.getState();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
    useAuthStore.setState({ accessToken: "test-token" });
    useSocialStore.setState({ userId: 1, pendingFriendCount: 0, pendingMentionCount: 0 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    useAuthStore.setState(previousAuth);
    useSocialStore.setState(previousSocial);
  });

  it("keeps a non-zero friend-request badge after one failed poll", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.startsWith("/api/social/friends")) {
        // First (initial) call succeeds with 2 pending; the second (60s
        // later, triggered by setInterval) fails with a 500.
        if (
          mockFetch.mock.calls.filter((c) => String(c[0]).startsWith("/api/social/friends"))
            .length === 1
        ) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                items: [
                  { status: "pending", direction: "received" },
                  { status: "pending", direction: "received" },
                ],
              }),
              { status: 200 }
            )
          );
        }
        return Promise.resolve(new Response(null, { status: 500 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ unreadCount: 0 }), { status: 200 }));
    });

    await act(async () => {
      renderWithIntl(<Header onSearchOpen={() => {}} />);
    });

    expect(useSocialStore.getState().pendingFriendCount).toBe(2);

    // Advance past the next 60s poll, which fails.
    await act(async () => {
      vi.advanceTimersByTime(61_000);
    });

    // A single failed poll must not clear the already-displayed count.
    expect(useSocialStore.getState().pendingFriendCount).toBe(2);
  });

  it("keeps a non-zero mention badge after one failed poll", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.startsWith("/api/social/mentions")) {
        if (
          mockFetch.mock.calls.filter((c) => String(c[0]).startsWith("/api/social/mentions"))
            .length === 1
        ) {
          return Promise.resolve(new Response(JSON.stringify({ unreadCount: 3 }), { status: 200 }));
        }
        return Promise.resolve(new Response(null, { status: 500 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ items: [] }), { status: 200 }));
    });

    await act(async () => {
      renderWithIntl(<Header onSearchOpen={() => {}} />);
    });

    expect(useSocialStore.getState().pendingMentionCount).toBe(3);

    await act(async () => {
      vi.advanceTimersByTime(61_000);
    });

    expect(useSocialStore.getState().pendingMentionCount).toBe(3);
  });
});
