import { screen } from "@testing-library/react";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { renderWithIntl } from "../../test-utils/render-with-intl";

vi.mock("@/components/layout/LandingHeader", () => ({
  LandingHeader: () => <div data-testid="landing-header" />,
}));

// AuthShell itself no longer imports next/navigation, but this mock still
// guards against a regression that reintroduces a router.replace redirect —
// without it, a reintroduced useRouter() call would throw ("expected app
// router to be mounted") outside a real Next router context, which would
// mask a redirect regression behind an unrelated crash instead of the tests
// below actually catching it.
const mockReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: mockReplace, refresh: vi.fn() }),
}));

import { AuthShell } from "@/components/layout/AuthShell";
import { useAuthStore } from "@/store/auth";

describe("AuthShell — auth-gate behavior", () => {
  const previousAuth = useAuthStore.getState();

  beforeEach(() => {
    useAuthStore.setState({ accessToken: null, isSessionLoading: false });
    mockReplace.mockReset();
  });

  afterEach(() => {
    useAuthStore.setState(previousAuth);
  });

  it("shows a loading state while the session is still restoring, not the sign-in prompt or children", () => {
    useAuthStore.setState({ accessToken: null, isSessionLoading: true });

    renderWithIntl(
      <AuthShell>
        <p>Gated content</p>
      </AuthShell>
    );

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText("Gated content")).not.toBeInTheDocument();
    expect(screen.queryByText("Sign in to continue")).not.toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("renders children once session restoration completes with a token", () => {
    useAuthStore.setState({ accessToken: "test-token", isSessionLoading: false });

    renderWithIntl(
      <AuthShell>
        <p>Gated content</p>
      </AuthShell>
    );

    expect(screen.getByText("Gated content")).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("shows a visible sign-in prompt — not children, and no silent redirect — once loading finishes with genuinely no token", () => {
    useAuthStore.setState({ accessToken: null, isSessionLoading: false });

    renderWithIntl(
      <AuthShell>
        <p>Gated content</p>
      </AuthShell>
    );

    expect(screen.queryByText("Gated content")).not.toBeInTheDocument();
    expect(screen.getByText("Sign in to continue")).toBeInTheDocument();
    expect(screen.getByText("You need to be signed in to view this page.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /log in/i })).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
