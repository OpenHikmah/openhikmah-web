import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAudioStore, type AudioVerse } from "@/store/audio";
import { useSurahListen } from "@/components/search/useSurahListen";
import type { MatchedSurah } from "@/types/quran";

const fatiha: MatchedSurah = { number: 1, name: "Al-Fatihah", nameArabic: "الفاتحة", ayahCount: 7 };

const playGraph = vi.fn();
const pause = vi.fn();
const resume = vi.fn();

function queueFor(surah: number, count: number): AudioVerse[] {
  return Array.from({ length: count }, (_, i) => ({
    ref: `${surah}:${i + 1}`,
    surah,
    ayah: i + 1,
    surahName: "x",
  }));
}

beforeEach(() => {
  playGraph.mockReset();
  pause.mockReset();
  resume.mockReset();
  useAudioStore.setState({ isPlaying: false, queue: [], playGraph, pause, resume });
});

describe("useSurahListen", () => {
  it("starts the whole surah as a queue of every ayah when nothing is loaded", () => {
    const { result } = renderHook(() => useSurahListen(fatiha));
    expect(result.current.isThisPlaying).toBe(false);
    act(() => result.current.handleListen());
    expect(playGraph).toHaveBeenCalledTimes(1);
    const queue = playGraph.mock.calls[0][0] as AudioVerse[];
    expect(queue).toHaveLength(7);
    expect(queue[0]).toEqual({ ref: "1:1", surah: 1, ayah: 1, surahName: "Al-Fatihah" });
    expect(queue[6]).toMatchObject({ ref: "1:7", ayah: 7 });
  });

  it("pauses when this surah's full queue is playing", () => {
    useAudioStore.setState({ isPlaying: true, queue: queueFor(1, 7) });
    const { result } = renderHook(() => useSurahListen(fatiha));
    expect(result.current.isThisPlaying).toBe(true);
    act(() => result.current.handleListen());
    expect(pause).toHaveBeenCalledTimes(1);
    expect(playGraph).not.toHaveBeenCalled();
  });

  it("resumes when this surah's queue is loaded but paused", () => {
    useAudioStore.setState({ isPlaying: false, queue: queueFor(1, 7) });
    const { result } = renderHook(() => useSurahListen(fatiha));
    expect(result.current.isThisPlaying).toBe(false);
    act(() => result.current.handleListen());
    expect(resume).toHaveBeenCalledTimes(1);
    expect(playGraph).not.toHaveBeenCalled();
  });

  it("does not mistake a single verse of this surah, played elsewhere, for the surah's own queue", () => {
    useAudioStore.setState({ isPlaying: true, queue: queueFor(1, 1) });
    const { result } = renderHook(() => useSurahListen(fatiha));
    expect(result.current.isThisPlaying).toBe(false);
    act(() => result.current.handleListen());
    expect(playGraph).toHaveBeenCalledTimes(1);
    expect(pause).not.toHaveBeenCalled();
  });

  it("does not treat another surah of the same length as this one", () => {
    useAudioStore.setState({ isPlaying: true, queue: queueFor(2, 7) });
    const { result } = renderHook(() => useSurahListen(fatiha));
    expect(result.current.isThisPlaying).toBe(false);
  });
});
