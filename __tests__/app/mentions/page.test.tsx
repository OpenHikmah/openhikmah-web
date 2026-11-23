import { screen, act, fireEvent } from "@testing-library/react";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { renderWithIntl } from "../../test-utils/render-with-intl";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/components/layout/LandingHeader", () => ({
  LandingHeader: () => <div data-testid="landing-header" />,
}));

import MentionsPage from "@/app/mentions/page";
import { TooltipProvider } from "@/components/ui";
import { useAuthStore } from "@/store/auth";
import { useSocialStore } from "@/store/social";

function mention(id: number, read: boolean) {
  return {
    id,
    noteId: id,
    verseRef: "2:255",
    read,
    createdAt: "2026-01-01T10:00:00.000Z",
    mentioningUsername: `friend${id}`,
  };
}

function renderPage() {
  return renderWithIntl(
    <TooltipProvider>
      <MentionsPage />
    </TooltipProvider>
  );
}

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

describe("MentionsPage", () => {
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

  const patchCalls = () =>
    mockFetch.mock.calls.filter(
      ([, init]) => (init as RequestInit | undefined)?.method === "PATCH"
    );

  describe("mark-as-read", () => {
    it("marks only the shown unread mentions and syncs the badge to the server's unread count", async () => {
      mockFetch.mockImplementation((_url: string, init?: RequestInit) =>
        init?.method === "PATCH"
          ? json({ ok: true, unreadCount: 7 })
          : json({
              items: [mention(1, false), mention(2, true), mention(3, false)],
              hasMore: true,
            })
      );

      await act(async () => {
        renderPage();
      });

      expect(patchCalls()).toHaveLength(1);
      expect(JSON.parse(patchCalls()[0][1].body)).toEqual({ ids: [1, 3] });
      // More than were shown remain unread, so the badge must not drop to 0.
      expect(useSocialStore.getState().pendingMentionCount).toBe(7);
    });

    it("does not call PATCH when every shown mention is already read", async () => {
      mockFetch.mockImplementation(() => json({ items: [mention(1, true)], hasMore: false }));

      await act(async () => {
        renderPage();
      });

      expect(patchCalls()).toHaveLength(0);
      expect(useSocialStore.getState().pendingMentionCount).toBe(3);
    });

    it("does not clear the mention badge when the mark-as-read PATCH fails", async () => {
      mockFetch.mockImplementation((_url: string, init?: RequestInit) =>
        init?.method === "PATCH"
          ? Promise.resolve(new Response(null, { status: 500 }))
          : json({ items: [mention(1, false)], hasMore: false })
      );
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await act(async () => {
        renderPage();
      });

      expect(useSocialStore.getState().pendingMentionCount).toBe(3);
      expect(await screen.findByText(/couldn.t mark mentions as read/i)).toBeInTheDocument();
      errorSpy.mockRestore();
    });

    it("clears a stale mark-as-read error once a later page's PATCH succeeds", async () => {
      let patchStatus = 500;
      mockFetch.mockImplementation((url: string, init?: RequestInit) => {
        if (init?.method === "PATCH")
          return patchStatus === 200
            ? json({ ok: true, unreadCount: 0 })
            : Promise.resolve(new Response(null, { status: patchStatus }));
        return url.includes("offset=")
          ? json({ items: [mention(2, false)], hasMore: false })
          : json({ items: [mention(1, false)], hasMore: true });
      });
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await act(async () => {
        renderPage();
      });
      expect(await screen.findByText(/couldn.t mark mentions as read/i)).toBeInTheDocument();

      patchStatus = 200;
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /load more/i }));
      });

      expect(screen.queryByText(/couldn.t mark mentions as read/i)).not.toBeInTheDocument();
      expect(useSocialStore.getState().pendingMentionCount).toBe(0);
      errorSpy.mockRestore();
    });
  });

  describe("pagination and read state", () => {
    it("shows 'Load more' when the API reports hasMore, and appends the next page by offset", async () => {
      mockFetch.mockImplementation((url: string, init?: RequestInit) => {
        if (init?.method === "PATCH") return json({ ok: true, unreadCount: 0 });
        return url.includes("offset=1")
          ? json({ items: [mention(2, true)], hasMore: false })
          : json({ items: [mention(1, true)], hasMore: true });
      });

      await act(async () => {
        renderPage();
      });
      expect(screen.getByText("@friend1")).toBeInTheDocument();
      expect(screen.queryByText("@friend2")).not.toBeInTheDocument();

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /load more/i }));
      });

      expect(screen.getByText("@friend2")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /load more/i })).not.toBeInTheDocument();
      expect(mockFetch.mock.calls.some(([u]) => String(u).includes("offset=1"))).toBe(true);
    });

    it("marks unread mentions with a 'New' badge and leaves read ones plain", async () => {
      mockFetch.mockImplementation((_url: string, init?: RequestInit) =>
        init?.method === "PATCH"
          ? json({ ok: true, unreadCount: 0 })
          : json({ items: [mention(1, false), mention(2, true)], hasMore: false })
      );

      await act(async () => {
        renderPage();
      });

      expect(screen.getAllByText("New")).toHaveLength(1);
      // Still highlighted after the PATCH succeeded: the visit keeps what was new.
      expect(document.querySelectorAll('[data-unread="true"]')).toHaveLength(1);
    });
  });
});
