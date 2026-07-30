import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { usePreferencesStore } from "@/store/preferences";
import { LocaleRehydrationSync } from "@/components/providers";

const { mockRefresh } = vi.hoisted(() => ({ mockRefresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mockRefresh }) }));

describe("LocaleRehydrationSync", () => {
  beforeEach(() => {
    mockRefresh.mockClear();
    usePreferencesStore.setState({ uiLocale: "en" });
  });

  it("does not refresh when the store's locale already matches the SSR locale", async () => {
    render(<LocaleRehydrationSync ssrLocale="en" />);
    await waitFor(() => expect(mockRefresh).not.toHaveBeenCalled());
  });

  it("refreshes once when the persisted store locale diverges from the SSR-rendered locale", async () => {
    // Simulates the store rehydrating client-side to a locale different from
    // the one the server resolved from a stale/missing cookie.
    usePreferencesStore.setState({ uiLocale: "tr" });

    render(<LocaleRehydrationSync ssrLocale="en" />);

    await waitFor(() => expect(mockRefresh).toHaveBeenCalledTimes(1));
    // A later, unrelated re-render with the same mismatch must not refresh again.
    usePreferencesStore.setState({ uiLocale: "tr" });
    await waitFor(() => expect(mockRefresh).toHaveBeenCalledTimes(1));
  });
});
