import { screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithIntl } from "../../test-utils/render-with-intl";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/components/layout/LandingHeader", () => ({
  LandingHeader: () => null,
}));

import SettingsPage from "@/app/settings/page";
import { usePreferencesStore } from "@/store/preferences";

describe("SettingsPage — Arabic on canvas cards", () => {
  beforeEach(() => {
    localStorage.clear();
    usePreferencesStore.setState({ canvasPrefs: { showArabic: true } });
  });

  it("shows the switch on, matching the saved preference", () => {
    renderWithIntl(<SettingsPage />);
    const toggle = screen.getByRole("switch", { name: "Show Arabic text on canvas cards" });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("Arabic on cards")).toBeInTheDocument();
  });

  it("turns Arabic on cards off and back on, saving the choice", () => {
    renderWithIntl(<SettingsPage />);
    const toggle = screen.getByRole("switch", { name: "Show Arabic text on canvas cards" });

    fireEvent.click(toggle);
    expect(usePreferencesStore.getState().canvasPrefs.showArabic).toBe(false);
    expect(toggle).toHaveAttribute("aria-checked", "false");

    fireEvent.click(toggle);
    expect(usePreferencesStore.getState().canvasPrefs.showArabic).toBe(true);
    expect(toggle).toHaveAttribute("aria-checked", "true");
  });

  it("starts off when the saved preference is off", () => {
    usePreferencesStore.setState({ canvasPrefs: { showArabic: false } });
    renderWithIntl(<SettingsPage />);
    expect(
      screen.getByRole("switch", { name: "Show Arabic text on canvas cards" })
    ).toHaveAttribute("aria-checked", "false");
  });

  it("no longer offers the removed minimap switch", () => {
    renderWithIntl(<SettingsPage />);
    expect(screen.queryByRole("switch", { name: /minimap/i })).toBeNull();
  });
});
