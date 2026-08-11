import { screen, fireEvent, act } from "@testing-library/react";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { renderWithIntl } from "../../test-utils/render-with-intl";

import { ContextSidebar } from "@/components/layout/ContextSidebar";
import { useCanvasStore } from "@/store/canvas";
import { useAuthStore } from "@/store/auth";
import type { Verse } from "@/types/quran";

const baseVerse: Verse = {
  surah: 2,
  ayah: 255,
  ref: "2:255",
  arabicText: "اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ",
  translation: "Allah — there is no deity except Him.",
  surahName: "Al-Baqarah",
  surahNameArabic: "البقرة",
};

describe("ContextSidebar — notes textarea accessibility", () => {
  const mockFetch = vi.fn();
  const previousAuth = useAuthStore.getState();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }))
    );
    useAuthStore.setState({ accessToken: "test-token" });
    useCanvasStore.getState().setSidebarContent({ type: "node", verse: baseVerse });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useAuthStore.setState(previousAuth);
    useCanvasStore.getState().setSidebarContent(null);
  });

  it("gives the notes textarea a programmatic accessible name", async () => {
    await act(async () => {
      renderWithIntl(<ContextSidebar />);
    });

    fireEvent.click(screen.getByRole("button", { name: "My Notes" }));

    expect(await screen.findByRole("textbox", { name: /add a private note/i })).toBeInTheDocument();
  });
});
