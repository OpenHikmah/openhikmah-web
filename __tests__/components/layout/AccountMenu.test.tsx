import { screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { renderWithIntl } from "../../test-utils/render-with-intl";

import { AccountMenu } from "@/components/layout/AccountMenu";
import { useAuthStore } from "@/store/auth";
import { useSocialStore } from "@/store/social";

describe("AccountMenu — logged-out sign-in button", () => {
  const previousAuth = useAuthStore.getState();

  beforeEach(() => {
    useAuthStore.setState({ accessToken: null, isSessionLoading: false });
  });

  afterEach(() => {
    useAuthStore.setState(previousAuth);
  });

  it("keeps its label on one line instead of wrapping under a squeezed layout", () => {
    renderWithIntl(<AccountMenu />);

    const button = screen.getByRole("button", { name: /log in/i });
    expect(button.className).toMatch(/\bwhitespace-nowrap\b/);
  });
});

describe("AccountMenu — dropdown a11y", () => {
  const previousAuth = useAuthStore.getState();
  const previousSocial = useSocialStore.getState();
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockResolvedValue(new Response(null, { status: 200 }));
    useAuthStore.setState({ accessToken: "test-token", isSessionLoading: false });
    useSocialStore.setState({ username: "shabnam", streak: 3, longestStreak: 10 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useAuthStore.setState(previousAuth);
    useSocialStore.setState(previousSocial);
  });

  it("doesn't claim ARIA menu semantics it doesn't implement (no roving focus, no arrow keys)", () => {
    renderWithIntl(<AccountMenu />);
    fireEvent.click(screen.getByRole("button", { name: /account menu/i }));

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
  });

  it("moves focus into the panel on open and back to the trigger on close", async () => {
    renderWithIntl(<AccountMenu />);
    const trigger = screen.getByRole("button", { name: /account menu/i });

    fireEvent.click(trigger);
    const firstLink = await screen.findByRole("link", { name: /saved canvases/i });
    await waitFor(() => expect(firstLink).toHaveFocus());

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("traps Tab within the open panel, wrapping last to first and first to last", async () => {
    renderWithIntl(<AccountMenu />);
    fireEvent.click(screen.getByRole("button", { name: /account menu/i }));

    const firstLink = await screen.findByRole("link", { name: /saved canvases/i });
    const signOutButton = screen.getByRole("button", { name: /sign out/i });

    await act(async () => {
      signOutButton.focus();
    });
    fireEvent.keyDown(signOutButton, { key: "Tab" });
    expect(document.activeElement).toBe(firstLink);

    fireEvent.keyDown(firstLink, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(signOutButton);
  });

  it("redirects focus to the Sign in button on sign-out, since the trigger unmounts", async () => {
    renderWithIntl(<AccountMenu />);
    fireEvent.click(screen.getByRole("button", { name: /account menu/i }));

    const signOutButton = await screen.findByRole("button", { name: /sign out/i });
    fireEvent.click(signOutButton);

    await waitFor(() => expect(screen.getByRole("button", { name: /log in/i })).toHaveFocus());
  });
});
