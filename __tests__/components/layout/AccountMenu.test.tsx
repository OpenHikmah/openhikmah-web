import { screen } from "@testing-library/react";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { renderWithIntl } from "../../test-utils/render-with-intl";

import { AccountMenu } from "@/components/layout/AccountMenu";
import { useAuthStore } from "@/store/auth";

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
