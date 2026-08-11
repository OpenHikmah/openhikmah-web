import { screen, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderWithIntl } from "../../test-utils/render-with-intl";

vi.mock("next/navigation", () => ({
  usePathname: () => "/bookmarks",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

import BookmarksPage from "@/app/bookmarks/page";
import { useAuthStore } from "@/store/auth";
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
