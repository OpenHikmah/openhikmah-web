import { screen, act } from "@testing-library/react";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { renderWithIntl } from "../../test-utils/render-with-intl";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/components/layout/LandingHeader", () => ({
  LandingHeader: () => <div data-testid="landing-header" />,
}));

import MentionsPage from "@/app/mentions/page";
import { useAuthStore } from "@/store/auth";
import { useSocialStore } from "@/store/social";

describe("MentionsPage — mark-as-read failure handling", () => {
  const mockFetch = vi.fn();
  const previousAuth = useAuthStore.getState();
  const previousSocial = useSocialStore.getState();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
    useAuthStore.setState({ accessToken: "test-token", isSessionLoading: false });
    useSocialStore.setState({ pendingMentionCount: 3 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useAuthStore.setState(previousAuth);
    useSocialStore.setState(previousSocial);
  });

  it("does not clear the mention badge when the mark-as-read PATCH fails", async () => {
    mockFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        return Promise.resolve(new Response(null, { status: 500 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ items: [] }), { status: 200 }));
    });

    await act(async () => {
      renderWithIntl(<MentionsPage />);
    });

    expect(useSocialStore.getState().pendingMentionCount).toBe(3);
    expect(await screen.findByText(/couldn.t mark mentions as read/i)).toBeInTheDocument();
  });

  it("clears the mention badge when the mark-as-read PATCH succeeds", async () => {
    mockFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        return Promise.resolve(new Response(null, { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ items: [] }), { status: 200 }));
    });

    await act(async () => {
      renderWithIntl(<MentionsPage />);
    });

    expect(useSocialStore.getState().pendingMentionCount).toBe(0);
    expect(screen.queryByText(/couldn.t mark mentions as read/i)).not.toBeInTheDocument();
  });

  it("clears a stale mark-as-read error once a later retry succeeds", async () => {
    let shouldFail = true;
    mockFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        return Promise.resolve(new Response(null, { status: shouldFail ? 500 : 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ items: [] }), { status: 200 }));
    });

    await act(async () => {
      renderWithIntl(<MentionsPage />);
    });

    expect(await screen.findByText(/couldn.t mark mentions as read/i)).toBeInTheDocument();

    // Simulate a token refresh, which re-runs the effect (deps: [accessToken]).
    shouldFail = false;
    await act(async () => {
      useAuthStore.setState({ accessToken: "refreshed-token" });
    });

    expect(useSocialStore.getState().pendingMentionCount).toBe(0);
    expect(screen.queryByText(/couldn.t mark mentions as read/i)).not.toBeInTheDocument();
  });
});
