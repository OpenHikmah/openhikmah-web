import { screen, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderWithIntl } from "../../test-utils/render-with-intl";
import { TooltipProvider } from "@/components/ui";
import { useAudioStore } from "@/store/audio";
import { SurahReaderList } from "@/app/surah/[number]/SurahReaderList";
import type { Verse } from "@/types/quran";

function verse(ref: string): Verse {
  const [s, a] = ref.split(":");
  return {
    surah: Number(s),
    ayah: Number(a),
    ref: ref as Verse["ref"],
    arabicText: "نَص",
    translation: `translation for ${ref}`,
    surahName: "Al-Fatiha",
    surahNameArabic: "الفاتحة",
  };
}

const VERSES = [verse("1:1"), verse("1:2"), verse("1:3")];

function renderList() {
  return renderWithIntl(
    <TooltipProvider>
      <SurahReaderList verses={VERSES} />
    </TooltipProvider>
  );
}

describe("SurahReaderList", () => {
  const scrollIntoView = vi.fn();

  beforeEach(() => {
    useAudioStore.setState({ currentRef: null, isPlaying: false });
    scrollIntoView.mockReset();
    // jsdom doesn't implement scrollIntoView.
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView;
  });

  it("renders every verse's reference and translation", () => {
    renderList();
    expect(screen.getByText("1:1")).toBeInTheDocument();
    expect(screen.getByText("translation for 1:2")).toBeInTheDocument();
    expect(screen.getByText("1:3")).toBeInTheDocument();
  });

  it("highlights the currently-playing verse's card", () => {
    useAudioStore.setState({ currentRef: "1:2", isPlaying: true });
    const { container } = renderList();
    const activeCard = screen.getByText("translation for 1:2").closest(".border-teal");
    expect(activeCard).not.toBeNull();
    // Only the active card gets the highlight, not the others.
    expect(container.querySelectorAll(".border-teal.bg-teal\\/\\[0\\.06\\]")).toHaveLength(1);
  });

  it("scrolls the active verse into view when currentRef changes to a verse in this list", () => {
    renderList();
    expect(scrollIntoView).not.toHaveBeenCalled();

    act(() => {
      useAudioStore.setState({ currentRef: "1:2", isPlaying: true });
    });

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
  });

  it("does not scroll when currentRef belongs to a different surah entirely", () => {
    useAudioStore.setState({ currentRef: "99:1", isPlaying: true });
    renderList();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("clicking Listen on an ayah plays just that single verse", () => {
    const playVerse = vi.fn();
    useAudioStore.setState({ playVerse });
    renderList();
    screen.getAllByRole("button", { name: "Listen to recitation" })[1].click();
    expect(playVerse).toHaveBeenCalledWith({
      ref: "1:2",
      surah: 1,
      ayah: 2,
      surahName: "Al-Fatiha",
    });
  });
});
