"use client";

import { useAudioStore, type AudioVerse } from "@/store/audio";
import type { MatchedSurah } from "@/types/quran";

/** Shared Listen/Pause/Resume wiring for a matched-surah search result,
 *  used by both the single-match card and the multi-match compact list. */
export function useSurahListen(surah: MatchedSurah) {
  const currentSurahName = useAudioStore((s) => s.currentSurahName);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const playGraph = useAudioStore((s) => s.playGraph);
  const pause = useAudioStore((s) => s.pause);
  const resume = useAudioStore((s) => s.resume);
  const isThisPlaying = currentSurahName === surah.name && isPlaying;

  const handleListen = () => {
    if (isThisPlaying) {
      pause();
      return;
    }
    if (currentSurahName === surah.name) {
      resume();
      return;
    }
    const queue: AudioVerse[] = Array.from({ length: surah.ayahCount }, (_, i) => ({
      ref: `${surah.number}:${i + 1}`,
      surah: surah.number,
      ayah: i + 1,
      surahName: surah.name,
    }));
    playGraph(queue);
  };

  return { isThisPlaying, handleListen };
}
