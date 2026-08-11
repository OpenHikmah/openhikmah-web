import { screen, act, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderWithIntl } from "../../test-utils/render-with-intl";

let mockSearchParams = new URLSearchParams({ q: "mercy" });
const mockReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: mockReplace }),
  useSearchParams: () => mockSearchParams,
  usePathname: () => "/search",
}));

import { SearchPageClient } from "@/app/search/SearchPageClient";
import { usePreferencesStore } from "@/store/preferences";

describe("SearchPageClient — rate-limit vs. genuine empty results", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows a distinct rate-limited message (with retry) for a 429 response", async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 429 }));

    await act(async () => {
      renderWithIntl(<SearchPageClient />);
    });

    expect(screen.getByText(/searching a bit fast/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
  });

  it("shows the generic error message for a non-429 failure", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network down"));

    await act(async () => {
      renderWithIntl(<SearchPageClient />);
    });

    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
  });

  it("shows genuine no-match copy for a real empty 200 response", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ results: [], total: 0, page: 1, pageSize: 20 }), {
        status: 200,
      })
    );

    await act(async () => {
      renderWithIntl(<SearchPageClient />);
    });

    expect(screen.getByText(/no exact matches/i)).toBeInTheDocument();
  });
});

describe("SearchPageClient — re-fetches when the UI language changes", () => {
  const mockFetch = vi.fn();
  const previousUiLocale = usePreferencesStore.getState().uiLocale;

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
    usePreferencesStore.setState({ uiLocale: "en" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    usePreferencesStore.setState({ uiLocale: previousUiLocale });
  });

  it("re-fetches results with the newly selected language once already on screen", async () => {
    const englishResult = {
      ref: "2:255",
      surahName: "Al-Baqarah",
      surahNameArabic: "البقرة",
      snippet: "Allah - there is no deity except Him.",
      arabicText: "الله لا إله إلا هو",
      translation: "Allah - there is no deity except Him.",
    };
    const turkishResult = { ...englishResult, translation: "Allah, O'ndan başka ilah yoktur." };

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ results: [englishResult], total: 1, page: 1, pageSize: 20 }), {
        status: 200,
      })
    );

    await act(async () => {
      renderWithIntl(<SearchPageClient />);
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(screen.getByText(englishResult.translation)).toBeInTheDocument();

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ results: [turkishResult], total: 1, page: 1, pageSize: 20 }), {
        status: 200,
      })
    );

    await act(async () => {
      usePreferencesStore.setState({ uiLocale: "tr" });
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(screen.getByText(turkishResult.translation)).toBeInTheDocument();
  });
});

describe("SearchPageClient — direct navigation clears a pending debounced navigation", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    mockSearchParams = new URLSearchParams();
    mockReplace.mockReset();
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ results: [], total: 0, page: 1, pageSize: 20 }), {
        status: 200,
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("clicking an example chip before the debounce fires wins, not the stale typed query", async () => {
    renderWithIntl(<SearchPageClient />);

    // Type a query — starts the 400ms debounce that would otherwise call
    // navigate("Patience search term", ...) once it fires.
    fireEvent.change(screen.getByRole("textbox", { name: /search verses/i }), {
      target: { value: "some other query" },
    });

    // Click an example chip before the debounce elapses.
    fireEvent.click(screen.getByRole("button", { name: "Mercy" }));

    // Let the original 400ms debounce timer (if not cleared) fire.
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    // Only the chip's direct navigate() call should have gone through — the
    // stale debounced call for the typed query must not have fired at all.
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining(`q=${encodeURIComponent("Mercy")}`)
    );
  });
});
