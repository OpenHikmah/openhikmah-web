import { screen, act, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderWithIntl } from "../../test-utils/render-with-intl";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/components/layout/LandingHeader", () => ({
  LandingHeader: () => <div data-testid="landing-header" />,
}));

vi.mock("@/components/social/AddFriendForm", () => ({
  AddFriendForm: ({ onAdded }: { onAdded: () => void }) => (
    <button onClick={onAdded}>add-friend-trigger</button>
  ),
}));

vi.mock("@/components/social/FriendList", () => ({
  FriendList: ({ friends, onUpdate }: { friends: unknown[]; onUpdate: () => void }) => (
    <div>
      <div data-testid="friends-count">{friends.length}</div>
      <button onClick={onUpdate}>friend-action-trigger</button>
    </div>
  ),
}));

vi.mock("@/components/social/LeaderboardTable", () => ({
  LeaderboardTable: ({ entries }: { entries: unknown[] }) => (
    <div data-testid="leaderboard-count">{entries.length}</div>
  ),
}));

vi.mock("@/components/social/CreateChallengeForm", () => ({
  CreateChallengeForm: () => <div />,
}));

vi.mock("@/components/social/ChallengeList", () => ({
  ChallengeList: () => <div />,
}));

vi.mock("@/components/social/ChallengeSuggestions", () => ({
  ChallengeSuggestions: () => <div />,
}));

import SocialPage from "@/app/social/page";
import { useAuthStore } from "@/store/auth";
import { useSocialStore } from "@/store/social";

function friendsPage(offset: number, count: number, hasMore: boolean) {
  return {
    items: Array.from({ length: count }, (_, i) => ({
      id: offset + i + 1,
      status: "accepted",
      direction: "sent",
      friend: { id: offset + i + 1, username: `user${offset + i + 1}`, streak: 0 },
    })),
    hasMore,
  };
}

describe("SocialPage — friend actions preserve loaded pages", () => {
  const mockFetch = vi.fn();
  const previousAuth = useAuthStore.getState();
  const previousSocial = useSocialStore.getState();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
    useAuthStore.setState({ accessToken: "test-token", isSessionLoading: false });
    useSocialStore.setState({ userId: 1, username: "me" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useAuthStore.setState(previousAuth);
    useSocialStore.setState(previousSocial);
  });

  it("does not drop a loaded second page of friends when a friend action fires afterward", async () => {
    // Initial page load: friends (page 1, 2 items, hasMore), leaderboard, challenges, suggestions.
    mockFetch.mockImplementation((url: string) => {
      if (url.startsWith("/api/social/friends?offset")) {
        return Promise.resolve(
          new Response(JSON.stringify(friendsPage(2, 2, false)), { status: 200 })
        );
      }
      if (url === "/api/social/friends") {
        return Promise.resolve(
          new Response(JSON.stringify(friendsPage(0, 2, true)), { status: 200 })
        );
      }
      if (url.startsWith("/api/social/friends?limit=")) {
        const limit = Number(new URL(url, "http://x").searchParams.get("limit"));
        return Promise.resolve(
          new Response(JSON.stringify(friendsPage(0, limit, limit < 4)), { status: 200 })
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ items: [], hasMore: false }), { status: 200 })
      );
    });

    await act(async () => {
      renderWithIntl(<SocialPage />);
    });

    fireEvent.click(screen.getByRole("button", { name: "Friends" }));
    await screen.findByTestId("friends-count");
    expect(screen.getByTestId("friends-count")).toHaveTextContent("2");

    // Load a second page.
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await act(async () => {});
    expect(screen.getByTestId("friends-count")).toHaveTextContent("4");

    // Perform a friend action (accept/decline/remove) — must re-fetch all 4
    // loaded items, not silently drop back to just the first page (2 items).
    fireEvent.click(screen.getByRole("button", { name: "friend-action-trigger" }));
    await act(async () => {});

    expect(screen.getByTestId("friends-count")).toHaveTextContent("4");
  });
});
