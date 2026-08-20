"use client";

import { useAudioStore, type AudioVerse } from "@/store/audio";
import type { MatchedSurah } from "@/types/quran";

export function useSurahListen(surah: MatchedSurah) {
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const queue = useAudioStore((s) => s.queue);
  const playGraph = useAudioStore((s) => s.playGraph);
  const pause = useAudioStore((s) => s.pause);
  const resume = useAudioStore((s) => s.resume);
  // Identity by surah number + queue shape, not the display name — a display
  // name isn't unique across locales/components, and a single verse from
  // this surah playing via a different flow (e.g. StoryVerseCard) must not
  // be mistaken for this surah's own full-queue playback.
  const isThisQueue = queue.length === surah.ayahCount && queue[0]?.surah === surah.number;
  const isThisPlaying = isThisQueue && isPlaying;

  const handleListen = () => {
    if (isThisPlaying) {
      pause();
      return;
    }
    if (isThisQueue) {
      resume();
      return;
    }
    const newQueue: AudioVerse[] = Array.from({ length: surah.ayahCount }, (_, i) => ({
      ref: `${surah.number}:${i + 1}`,
      surah: surah.number,
      ayah: i + 1,
      surahName: surah.name,
    }));
    playGraph(newQueue);
  };

  return { isThisPlaying, handleListen };
}
