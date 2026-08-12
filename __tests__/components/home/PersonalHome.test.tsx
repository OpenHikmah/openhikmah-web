import { screen } from "@testing-library/react";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { renderWithIntl } from "../../test-utils/render-with-intl";
import { PersonalHome } from "@/components/home/PersonalHome";
import { useAuthStore } from "@/store/auth";
import { useSocialStore } from "@/store/social";

describe("PersonalHome — greeting must not imply a signed-in identity for anonymous visitors", () => {
  const previousAuth = useAuthStore.getState();
  const previousSocial = useSocialStore.getState();

  beforeEach(() => {
    useAuthStore.setState({ accessToken: null });
    useSocialStore.setState({ username: null });
  });

  afterEach(() => {
    useAuthStore.setState(previousAuth);
    useSocialStore.setState(previousSocial);
  });

  it("shows a neutral greeting (not 'Welcome back') for an anonymous visitor with local canvas progress", () => {
    // This is the state HomeView.tsx renders PersonalHome for even when the
    // header still shows "Log in" — a returning-user greeting here would
    // contradict that signal (issue #445).
    useAuthStore.setState({ accessToken: null });

    renderWithIntl(<PersonalHome verse={null} />);

    expect(screen.getByText("Continue exploring")).toBeInTheDocument();
    expect(screen.queryByText("Welcome back")).not.toBeInTheDocument();
  });

  it("shows 'Welcome back' for an authenticated user with no username yet", () => {
    useAuthStore.setState({ accessToken: "test-token" });
    useSocialStore.setState({ username: null });

    renderWithIntl(<PersonalHome verse={null} />);

    expect(screen.getByText("Welcome back")).toBeInTheDocument();
    expect(screen.queryByText("Continue exploring")).not.toBeInTheDocument();
  });

  it("shows 'Welcome back, {username}' for an authenticated user with a username", () => {
    useAuthStore.setState({ accessToken: "test-token" });
    useSocialStore.setState({ username: "hikmah_seeker" });

    renderWithIntl(<PersonalHome verse={null} />);

    expect(screen.getByText("hikmah_seeker")).toBeInTheDocument();
    expect(screen.queryByText("Continue exploring")).not.toBeInTheDocument();
  });
});
