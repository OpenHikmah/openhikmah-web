import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithIntl } from "../../test-utils/render-with-intl";
import type { MatchedSurah } from "@/types/quran";

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

import { SurahReaderActions } from "@/app/surah/[number]/SurahReaderActions";

const SURAH: MatchedSurah = { number: 18, name: "Al-Kahf", nameArabic: "الكهف", ayahCount: 110 };

function fullQueueFor(surah: MatchedSurah) {
  return Array.from({ length: surah.ayahCount }, (_, i) => ({ surah: surah.number, ayah: i + 1 }));
}

describe("SurahReaderActions", () => {
  beforeEach(() => {
    mockPlayGraph.mockReset();
    mockPause.mockReset();
    mockResume.mockReset();
    storeState.isPlaying = false;
    storeState.queue = [];
  });

  it("shows the default Listen control and queues the whole surah when clicked", () => {
    renderWithIntl(<SurahReaderActions surah={SURAH} />);
    const button = screen.getByRole("button", { name: "Listen" });
    expect(button).toBeInTheDocument();

    fireEvent.click(button);
    expect(mockPlayGraph).toHaveBeenCalledTimes(1);
    const queue = mockPlayGraph.mock.calls[0][0];
    expect(queue).toHaveLength(110);
    expect(queue[0]).toEqual({ ref: "18:1", surah: 18, ayah: 1, surahName: "Al-Kahf" });
  });

  it("shows the Pause label while this surah's queue is actively playing", () => {
    storeState.queue = fullQueueFor(SURAH);
    storeState.isPlaying = true;
    renderWithIntl(<SurahReaderActions surah={SURAH} />);

    const button = screen.getByRole("button", { name: "Pause" });
    expect(button).toBeInTheDocument();

    fireEvent.click(button);
    expect(mockPause).toHaveBeenCalledTimes(1);
    expect(mockPlayGraph).not.toHaveBeenCalled();
  });

  it("links the Canvas escape hatch to this surah's bulk-load route", () => {
    renderWithIntl(<SurahReaderActions surah={SURAH} />);
    expect(screen.getByRole("link", { name: "Open in Canvas instead" })).toHaveAttribute(
      "href",
      "/canvas?surah=18"
    );
  });
});
