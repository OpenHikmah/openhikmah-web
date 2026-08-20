import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithIntl } from "../../test-utils/render-with-intl";
import type { MatchedSurah } from "@/types/quran";

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

import { SurahResultCard } from "@/components/search/SurahResultCard";

const SURAH: MatchedSurah = { number: 18, name: "Al-Kahf", nameArabic: "الكهف", ayahCount: 110 };

describe("SurahResultCard", () => {
  beforeEach(() => {
    mockPlayGraph.mockReset();
    mockPause.mockReset();
    mockResume.mockReset();
    storeState.currentSurahName = null;
    storeState.isPlaying = false;
  });

  it("queues every ayah of the surah in order when Listen is clicked", () => {
    renderWithIntl(<SurahResultCard surah={SURAH} />);
    fireEvent.click(screen.getByRole("button", { name: "Listen" }));

    expect(mockPlayGraph).toHaveBeenCalledTimes(1);
    const queue = mockPlayGraph.mock.calls[0][0];
    expect(queue).toHaveLength(110);
    expect(queue[0]).toEqual({ ref: "18:1", surah: 18, ayah: 1, surahName: "Al-Kahf" });
    expect(queue[109]).toEqual({ ref: "18:110", surah: 18, ayah: 110, surahName: "Al-Kahf" });
    expect(mockPause).not.toHaveBeenCalled();
    expect(mockResume).not.toHaveBeenCalled();
  });

  it("pauses instead of re-queueing when this surah is already playing", () => {
    storeState.currentSurahName = "Al-Kahf";
    storeState.isPlaying = true;
    renderWithIntl(<SurahResultCard surah={SURAH} />);
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));

    expect(mockPause).toHaveBeenCalledTimes(1);
    expect(mockPlayGraph).not.toHaveBeenCalled();
  });

  it("resumes instead of re-queueing when this surah is current but paused", () => {
    storeState.currentSurahName = "Al-Kahf";
    storeState.isPlaying = false;
    renderWithIntl(<SurahResultCard surah={SURAH} />);
    fireEvent.click(screen.getByRole("button", { name: "Listen" }));

    expect(mockResume).toHaveBeenCalledTimes(1);
    expect(mockPlayGraph).not.toHaveBeenCalled();
  });

  it("links Read in Canvas to the surah's bulk-load route", () => {
    renderWithIntl(<SurahResultCard surah={SURAH} />);
    expect(screen.getByRole("link", { name: /Read in Canvas/ })).toHaveAttribute(
      "href",
      "/canvas?surah=18"
    );
  });
});
