import type { ReactElement } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithIntl } from "../../test-utils/render-with-intl";
import { TooltipProvider } from "@/components/ui";
import type { MatchedSurah } from "@/types/quran";

function render(ui: ReactElement) {
  return renderWithIntl(<TooltipProvider>{ui}</TooltipProvider>);
}

const { mockPlayGraph, mockPause, mockResume, storeState } = vi.hoisted(() => ({
  mockPlayGraph: vi.fn(),
  mockPause: vi.fn(),
  mockResume: vi.fn(),
  storeState: { currentSurahName: null as string | null, isPlaying: false },
}));

vi.mock("@/store/audio", () => ({
  useAudioStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      currentSurahName: storeState.currentSurahName,
      isPlaying: storeState.isPlaying,
      playGraph: mockPlayGraph,
      pause: mockPause,
      resume: mockResume,
    }),
}));

import { SurahListItem } from "@/components/search/SurahListItem";

const BAQARAH: MatchedSurah = {
  number: 2,
  name: "Al-Baqarah",
  nameArabic: "البقرة",
  ayahCount: 286,
};
const BALAD: MatchedSurah = { number: 90, name: "Al-Balad", nameArabic: "البلد", ayahCount: 20 };

describe("SurahListItem", () => {
  beforeEach(() => {
    mockPlayGraph.mockReset();
    mockPause.mockReset();
    mockResume.mockReset();
    storeState.currentSurahName = null;
    storeState.isPlaying = false;
  });

  it("queues this row's own surah when Listen is clicked", () => {
    render(<SurahListItem surah={BAQARAH} />);
    fireEvent.click(screen.getByRole("button", { name: "Listen" }));

    expect(mockPlayGraph).toHaveBeenCalledTimes(1);
    const queue = mockPlayGraph.mock.calls[0][0];
    expect(queue).toHaveLength(286);
    expect(queue[0]).toEqual({ ref: "2:1", surah: 2, ayah: 1, surahName: "Al-Baqarah" });
  });

  it("shows Pause only for the row that is actually playing", () => {
    storeState.currentSurahName = "Al-Baqarah";
    storeState.isPlaying = true;
    render(
      <>
        <SurahListItem surah={BAQARAH} />
        <SurahListItem surah={BALAD} />
      </>
    );

    expect(screen.getAllByRole("button", { name: "Pause" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Listen" })).toHaveLength(1);
  });

  it("links Read in Canvas to this row's own surah number", () => {
    render(<SurahListItem surah={BALAD} />);
    expect(screen.getByRole("link", { name: "Read in Canvas" })).toHaveAttribute(
      "href",
      "/canvas?surah=90"
    );
  });

  it("renders the ayah count and Arabic name", () => {
    const { container } = render(<SurahListItem surah={BALAD} />);
    expect(container.textContent).toContain("20 ayahs");
    expect(screen.getByText("البلد")).toBeInTheDocument();
  });
});
