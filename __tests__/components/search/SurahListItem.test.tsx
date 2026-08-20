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
  storeState: { isPlaying: false, queue: [] as { surah: number; ayah: number }[] },
}));

vi.mock("@/store/audio", () => ({
  useAudioStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      isPlaying: storeState.isPlaying,
      queue: storeState.queue,
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

function fullQueueFor(surah: MatchedSurah) {
  return Array.from({ length: surah.ayahCount }, (_, i) => ({ surah: surah.number, ayah: i + 1 }));
}

describe("SurahListItem", () => {
  beforeEach(() => {
    mockPlayGraph.mockReset();
    mockPause.mockReset();
    mockResume.mockReset();
    storeState.isPlaying = false;
    storeState.queue = [];
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
    storeState.queue = fullQueueFor(BAQARAH);
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

  it("does not treat a same-length queue with a mismatched entry as this surah's queue", () => {
    const corrupted = fullQueueFor(BAQARAH);
    corrupted[50] = { surah: 99, ayah: 1 };
    storeState.queue = corrupted;
    storeState.isPlaying = true;
    render(<SurahListItem surah={BAQARAH} />);

    expect(screen.getByRole("button", { name: "Listen" })).toBeInTheDocument();
  });

  it("identifies the active row by surah number, not a shared/localized display name", () => {
    storeState.queue = fullQueueFor(BAQARAH);
    storeState.isPlaying = true;
    const relabeled: MatchedSurah = { ...BAQARAH, name: "Bakara" };
    render(<SurahListItem surah={relabeled} />);

    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
  });

  it("links Read to this row's own surah reading page", () => {
    render(<SurahListItem surah={BALAD} />);
    expect(screen.getByRole("link", { name: "Read" })).toHaveAttribute("href", "/surah/90");
  });

  it("renders the ayah count and Arabic name", () => {
    const { container } = render(<SurahListItem surah={BALAD} />);
    expect(container.textContent).toContain("20 ayahs");
    expect(screen.getByText("البلد")).toBeInTheDocument();
  });
});
