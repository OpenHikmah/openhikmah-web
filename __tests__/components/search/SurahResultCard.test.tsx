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

import { SurahResultCard } from "@/components/search/SurahResultCard";

const SURAH: MatchedSurah = { number: 18, name: "Al-Kahf", nameArabic: "الكهف", ayahCount: 110 };

function fullQueueFor(surah: MatchedSurah) {
  return Array.from({ length: surah.ayahCount }, (_, i) => ({ surah: surah.number, ayah: i + 1 }));
}

describe("SurahResultCard", () => {
  beforeEach(() => {
    mockPlayGraph.mockReset();
    mockPause.mockReset();
    mockResume.mockReset();
    storeState.isPlaying = false;
    storeState.queue = [];
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
    storeState.queue = fullQueueFor(SURAH);
    storeState.isPlaying = true;
    renderWithIntl(<SurahResultCard surah={SURAH} />);
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));

    expect(mockPause).toHaveBeenCalledTimes(1);
    expect(mockPlayGraph).not.toHaveBeenCalled();
  });

  it("resumes instead of re-queueing when this surah is current but paused", () => {
    storeState.queue = fullQueueFor(SURAH);
    storeState.isPlaying = false;
    renderWithIntl(<SurahResultCard surah={SURAH} />);
    fireEvent.click(screen.getByRole("button", { name: "Listen" }));

    expect(mockResume).toHaveBeenCalledTimes(1);
    expect(mockPlayGraph).not.toHaveBeenCalled();
  });

  it("identifies the active queue by surah number/shape, not the localized display name", () => {
    // Same underlying surah (number 18, full 110-ayah queue) but this card
    // instance renders it under a different display name (e.g. a localized
    // label) — must still recognize it as the active queue.
    storeState.queue = fullQueueFor(SURAH);
    storeState.isPlaying = true;
    const relabeled: MatchedSurah = { ...SURAH, name: "Kehf" };
    renderWithIntl(<SurahResultCard surah={relabeled} />);

    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
  });

  it("does not treat a single verse from this surah (played elsewhere) as this surah's queue", () => {
    // e.g. StoryVerseCard playing just one ayah via playVerse — a 1-item
    // queue must not be mistaken for the full-surah queue.
    storeState.queue = [{ surah: 18, ayah: 5 }];
    storeState.isPlaying = true;
    renderWithIntl(<SurahResultCard surah={SURAH} />);

    expect(screen.getByRole("button", { name: "Listen" })).toBeInTheDocument();
  });

  it("links Read in Canvas to the surah's bulk-load route", () => {
    renderWithIntl(<SurahResultCard surah={SURAH} />);
    expect(screen.getByRole("link", { name: /Read in Canvas/ })).toHaveAttribute(
      "href",
      "/canvas?surah=18"
    );
  });
});
