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

describe("OnboardingPage — redirect vs. session restoration race", () => {
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
  });

  it("redirects home once the session has finished restoring and there is genuinely no token", async () => {
    useAuthStore.setState({ accessToken: null, isSessionLoading: false });

    await act(async () => {
      renderWithIntl(<OnboardingPage />);
    });

    expect(mockReplace).toHaveBeenCalledWith("/");
  });

  it("renders the onboarding form once session restoration completes with a token — the case a refresh mid-flow must not lose", async () => {
    useAuthStore.setState({ accessToken: "test-token", isSessionLoading: false });

    await act(async () => {
      renderWithIntl(<OnboardingPage />);
    });

    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByText("Choose a username")).toBeInTheDocument();
  });

  it("does not redirect if isSessionLoading flips back to true after a token was already present", async () => {
    useAuthStore.setState({ accessToken: "test-token", isSessionLoading: false });

    await act(async () => {
      renderWithIntl(<OnboardingPage />);
    });
    expect(screen.getByText("Choose a username")).toBeInTheDocument();

    await act(async () => {
      useAuthStore.setState({ isSessionLoading: true });
    });

    expect(mockReplace).not.toHaveBeenCalled();
  });
});
