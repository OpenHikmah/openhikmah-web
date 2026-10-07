import { screen, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderWithIntl } from "../../test-utils/render-with-intl";

vi.mock("next/navigation", () => ({
  usePathname: () => "/bookmarks",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

import BookmarksPage from "@/app/bookmarks/page";
import { useAuthStore } from "@/store/auth";
import { usePreferencesStore } from "@/store/preferences";
import { TooltipProvider } from "@/components/ui";

describe("BookmarksPage — bookmark button busy state", () => {
  const mockFetch = vi.fn();
  const previousAuthState = useAuthStore.getState();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useAuthStore.setState(previousAuthState);
  });

  it("disables the remove-bookmark button while its ref is busy", async () => {
    useAuthStore.setState({
      bookmarks: ["2:255"],
      bookmarksLoadError: false,
      bookmarkBusy: { "2:255": true },
    });

    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          surah: 2,
          ayah: 255,
          ref: "2:255",
          arabicText: "الله لا إله إلا هو الحي القيوم",
          // en.sahih (Saheeh International, alquran.cloud) excerpt.
          translation: "Allah - there is no deity except Him, the Ever-Living, the Sustainer.",
          surahName: "Al-Baqarah",
          surahNameArabic: "البقرة",
        }),
        { status: 200 }
      )
    );

    await act(async () => {
      renderWithIntl(
        <TooltipProvider>
          <BookmarksPage />
        </TooltipProvider>
      );
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /remove bookmark/i })).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: /remove bookmark/i })).toBeDisabled();
  });
});

describe("BookmarksPage — verse cache is per edition", () => {
  const mockFetch = vi.fn();
  const previousAuthState = useAuthStore.getState();
  const previousPrefs = usePreferencesStore.getState();

  const verseBody = (translation: string) =>
    JSON.stringify({
      surah: 1,
      ayah: 1,
      ref: "1:1",
      arabicText: "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ",
      translation,
      surahName: "Al-Fatihah",
      surahNameArabic: "الفاتحة",
    });

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
    useAuthStore.setState({ bookmarks: ["1:1"], bookmarksLoadError: false, bookmarkBusy: {} });
    usePreferencesStore.setState({ uiLocale: "en", quranEditionByLocale: {} });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useAuthStore.setState(previousAuthState);
    usePreferencesStore.setState(previousPrefs);
  });

  it("refetches and shows the new translation after the locale changes, even for a cached ref", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(verseBody("In the name of Allah, the Entirely Merciful"), { status: 200 })
    );
    renderWithIntl(
      <TooltipProvider>
        <BookmarksPage />
      </TooltipProvider>
    );
    expect(await screen.findByText(/Entirely Merciful/)).toBeInTheDocument();

    mockFetch.mockResolvedValueOnce(
      new Response(verseBody("Rəhman və Rəhim Allahın adı ilə"), { status: 200 })
    );
    act(() => usePreferencesStore.setState({ uiLocale: "az" }));

    expect(await screen.findByText(/Rəhman və Rəhim/)).toBeInTheDocument();
    expect(screen.queryByText(/Entirely Merciful/)).not.toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("serves from the cache when returning to an edition that was already fetched", async () => {
    usePreferencesStore.setState({ uiLocale: "ru" });
    mockFetch.mockResolvedValueOnce(new Response(verseBody("Во имя Аллаха"), { status: 200 }));
    const { unmount } = renderWithIntl(
      <TooltipProvider>
        <BookmarksPage />
      </TooltipProvider>
    );
    expect(await screen.findByText(/Во имя Аллаха/)).toBeInTheDocument();
    unmount();

    renderWithIntl(
      <TooltipProvider>
        <BookmarksPage />
      </TooltipProvider>
    );
    expect(await screen.findByText(/Во имя Аллаха/)).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
