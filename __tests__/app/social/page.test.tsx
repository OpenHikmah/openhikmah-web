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
  FriendList: ({ friends, onUpdate }: { friends: { id: number }[]; onUpdate: () => void }) => (
    <div>
      <div data-testid="friends-count">{friends.length}</div>
      <ul>
        {friends.map((f) => (
          <li key={f.id} data-testid={`friend-${f.id}`} />
        ))}
      </ul>
      <button onClick={onUpdate}>friend-action-trigger</button>
    </div>
  ),
}));

vi.mock("@/components/social/LeaderboardTable", () => ({
  LeaderboardTable: ({ entries }: { entries: { id: number }[] }) => (
    <div>
      <div data-testid="leaderboard-count">{entries.length}</div>
      <ul>
        {entries.map((e) => (
          <li key={e.id} data-testid={`leaderboard-entry-${e.id}`} />
        ))}
      </ul>
    </div>
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

function leaderboardPage(offset: number, count: number, hasMore: boolean) {
  return {
    items: Array.from({ length: count }, (_, i) => ({
      id: offset + i + 1,
      username: `user${offset + i + 1}`,
      streak: 0,
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
        // Server only ever has 4 friends total — a request for more than that
        // (the fetchFriends +1 buffer) is capped by what actually exists,
        // not fabricated, matching how a real paginated endpoint behaves.
        const requested = Number(new URL(url, "http://x").searchParams.get("limit"));
        const count = Math.min(requested, 4);
        return Promise.resolve(
          new Response(JSON.stringify(friendsPage(0, count, false)), { status: 200 })
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

  it("does not drop a previously-visible friend when a new friend is added", async () => {
    // Server has 2 friends (ids 1, 2, newest-first). Adding a friend makes it
    // 3 (id 99 newest). fetchFriends captures the OLD count (2) before the
    // add — without the +1 buffer, requesting limit=2 against a newest-first
    // list would return [99, 2], silently dropping id 1 from view.
    mockFetch.mockImplementation((url: string) => {
      if (url === "/api/social/friends") {
        return Promise.resolve(
          new Response(JSON.stringify(friendsPage(0, 2, false)), { status: 200 })
        );
      }
      if (url.startsWith("/api/social/friends?limit=")) {
        const requested = Number(new URL(url, "http://x").searchParams.get("limit"));
        const all = [
          { id: 99, status: "accepted", direction: "sent", friend: { id: 99, username: "new" } },
          { id: 2, status: "accepted", direction: "sent", friend: { id: 2, username: "user2" } },
          { id: 1, status: "accepted", direction: "sent", friend: { id: 1, username: "user1" } },
        ];
        return Promise.resolve(
          new Response(JSON.stringify({ items: all.slice(0, requested), hasMore: false }), {
            status: 200,
          })
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
    expect(screen.getByTestId("friend-1")).toBeInTheDocument();
    expect(screen.getByTestId("friend-2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "add-friend-trigger" }));
    await act(async () => {});

    expect(screen.getByTestId("friend-1")).toBeInTheDocument();
    expect(screen.getByTestId("friend-2")).toBeInTheDocument();
    expect(screen.getByTestId("friend-99")).toBeInTheDocument();
  });

  it("does not drop a loaded second page of the leaderboard when a friend action fires afterward", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.startsWith("/api/social/leaderboard?offset")) {
        return Promise.resolve(
          new Response(JSON.stringify(leaderboardPage(2, 2, false)), { status: 200 })
        );
      }
      if (url === "/api/social/leaderboard") {
        return Promise.resolve(
          new Response(JSON.stringify(leaderboardPage(0, 2, true)), { status: 200 })
        );
      }
      if (url.startsWith("/api/social/leaderboard?limit=")) {
        // Server only ever has 4 entries total — a request for more than that
        // (the fetchLeaderboard +1 buffer) is capped by what actually exists.
        const requested = Number(new URL(url, "http://x").searchParams.get("limit"));
        const count = Math.min(requested, 4);
        return Promise.resolve(
          new Response(JSON.stringify(leaderboardPage(0, count, false)), { status: 200 })
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ items: [], hasMore: false }), { status: 200 })
      );
    });

    await act(async () => {
      renderWithIntl(<SocialPage />);
    });

    // Leaderboard is the default tab — no tab click needed to see it.
    await screen.findByTestId("leaderboard-count");
    expect(screen.getByTestId("leaderboard-count")).toHaveTextContent("2");

    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await act(async () => {});
    expect(screen.getByTestId("leaderboard-count")).toHaveTextContent("4");

    // Switching to Friends and firing a friend action re-fetches the
    // leaderboard too (a new/changed friend can move leaderboard entries).
    fireEvent.click(screen.getByRole("button", { name: "Friends" }));
    fireEvent.click(screen.getByRole("button", { name: "friend-action-trigger" }));
    await act(async () => {});

    fireEvent.click(screen.getByRole("button", { name: "Leaderboard" }));
    expect(screen.getByTestId("leaderboard-count")).toHaveTextContent("4");
    expect(screen.getByTestId("leaderboard-entry-1")).toBeInTheDocument();
    expect(screen.getByTestId("leaderboard-entry-2")).toBeInTheDocument();
    expect(screen.getByTestId("leaderboard-entry-3")).toBeInTheDocument();
    expect(screen.getByTestId("leaderboard-entry-4")).toBeInTheDocument();
  });
});
