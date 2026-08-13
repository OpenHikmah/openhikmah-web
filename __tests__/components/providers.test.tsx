import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor, cleanup } from "@testing-library/react";
import { usePreferencesStore } from "@/store/preferences";
import { useAuthStore } from "@/store/auth";
import { LocaleRehydrationSync, SessionRestorer } from "@/components/providers";

const { mockRefresh } = vi.hoisted(() => ({ mockRefresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mockRefresh }) }));
vi.mock("@/hooks/useCanvasPersistence", () => ({
  mergeGuestWorkspace: vi.fn().mockResolvedValue(undefined),
}));

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

describe("SessionRestorer", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
    useAuthStore.setState({ accessToken: null, isSessionLoading: true });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    // Clear the marker cookie so it doesn't leak between tests.
    document.cookie = "qf_has_session=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/";
  });

  it("logs a distinguishing message and still resolves session loading when refresh throws", async () => {
    document.cookie = "qf_has_session=1";
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetch.mockRejectedValueOnce(new Error("network down"));

    render(<SessionRestorer />);

    await waitFor(() => expect(useAuthStore.getState().isSessionLoading).toBe(false));
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("session restore failed"),
      expect.any(Error)
    );
    errorSpy.mockRestore();
  });

  it("does not log an error for the expected no-session case (non-OK refresh response)", async () => {
    document.cookie = "qf_has_session=1";
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetch.mockResolvedValueOnce({ ok: false });

    render(<SessionRestorer />);

    await waitFor(() => expect(useAuthStore.getState().isSessionLoading).toBe(false));
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("skips the refresh call entirely when a token is already in memory", async () => {
    useAuthStore.setState({ accessToken: "already-signed-in", isSessionLoading: true });

    render(<SessionRestorer />);

    await waitFor(() => expect(useAuthStore.getState().isSessionLoading).toBe(false));
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("skips the refresh call entirely when there's no qf_has_session marker cookie", async () => {
    // document.cookie is empty by default in jsdom — this is the common
    // anonymous-visitor case that previously fired a doomed refresh request
    // (and its resulting 401) on every page load.
    render(<SessionRestorer />);

    await waitFor(() => expect(useAuthStore.getState().isSessionLoading).toBe(false));
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("calls refresh when the qf_has_session marker cookie is present", async () => {
    document.cookie = "qf_has_session=1";
    mockFetch.mockResolvedValueOnce({ ok: false });

    render(<SessionRestorer />);

    await waitFor(() => expect(useAuthStore.getState().isSessionLoading).toBe(false));
    expect(mockFetch).toHaveBeenCalledWith("/api/auth/refresh", expect.any(Object));
  });
});
