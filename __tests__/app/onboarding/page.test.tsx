import { screen, act } from "@testing-library/react";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { renderWithIntl } from "../../test-utils/render-with-intl";

const mockReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: mockReplace, refresh: vi.fn() }),
}));

import OnboardingPage from "@/app/onboarding/page";
import { useAuthStore } from "@/store/auth";
import { useSocialStore } from "@/store/social";

describe("OnboardingPage — session restoration race and auth-gate behavior", () => {
  const previousAuth = useAuthStore.getState();
  const previousSocial = useSocialStore.getState();

  beforeEach(() => {
    mockReplace.mockReset();
  });

  afterEach(() => {
    useAuthStore.setState(previousAuth);
    useSocialStore.setState(previousSocial);
  });

  it("does not redirect while the session is still restoring, even though accessToken is still null", async () => {
    useAuthStore.setState({ accessToken: null, isSessionLoading: true });

    await act(async () => {
      renderWithIntl(<OnboardingPage />);
    });

    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.queryByText("Choose a username")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows a sign-in prompt (not a silent redirect) once the session has finished restoring with genuinely no token", async () => {
    useAuthStore.setState({ accessToken: null, isSessionLoading: false });

    await act(async () => {
      renderWithIntl(<OnboardingPage />);
    });

    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByText("Sign in to continue")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /log in/i })).toBeInTheDocument();
  });

  it("renders the onboarding form once session restoration completes with a token — the case a refresh mid-flow must not lose", async () => {
    useAuthStore.setState({ accessToken: "test-token", isSessionLoading: false });

    await act(async () => {
      renderWithIntl(<OnboardingPage />);
    });

    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByText("Choose a username")).toBeInTheDocument();
  });

  it("never redirects across the real restore sequence: loading+null → token arrives → loading settles", async () => {
    // Mirrors SessionRestorer's actual ordering (components/providers.tsx):
    // setTokens() lands inside the refresh .then(), setSessionLoaded() only
    // in the .finally() — so accessToken can be set for a while before
    // isSessionLoading flips to false. This is the sequence the fix exists
    // for, not a single static snapshot of state.
    useAuthStore.setState({ accessToken: null, isSessionLoading: true });
    await act(async () => {
      renderWithIntl(<OnboardingPage />);
    });
    expect(mockReplace).not.toHaveBeenCalled();

    await act(async () => {
      useAuthStore.setState({ accessToken: "test-token" });
    });
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.queryByText("Choose a username")).not.toBeInTheDocument();

    await act(async () => {
      useAuthStore.setState({ isSessionLoading: false });
    });
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByText("Choose a username")).toBeInTheDocument();
  });
});
