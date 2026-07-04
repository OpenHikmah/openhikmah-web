"use client";

import { create } from "zustand";
import { getAudioUrl } from "@/lib/audio";

export interface AudioVerse {
  ref: string;
  surah: number;
  ayah: number;
  surahName: string;
}

interface AudioStore {
  currentRef: string | null;
  currentSurahName: string | null;
  isPlaying: boolean;
  isLoading: boolean;
  queue: AudioVerse[];
  queueIndex: number;

  playVerse: (verse: AudioVerse) => void;
  playGraph: (verses: AudioVerse[]) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  next: () => void;
  prev: () => void;
  _onEnded: () => void;
}

// Module-level Audio instance — lives outside React renders
let _audio: HTMLAudioElement | null = null;
function getAudio(): HTMLAudioElement {
  if (!_audio && typeof window !== "undefined") {
    _audio = new Audio();
    _audio.preload = "auto";
  }
  return _audio!;
}

function loadAndPlay(verse: AudioVerse, onEnded: () => void) {
  const a = getAudio();
  a.onended = onEnded;
  a.src = getAudioUrl(verse.surah, verse.ayah);
  a.load();
  return a.play();
}

export const useAudioStore = create<AudioStore>((set, get) => ({
  currentRef: null,
  currentSurahName: null,
  isPlaying: false,
  isLoading: false,
  queue: [],
  queueIndex: 0,

  playVerse: (verse) => {
    set({
      currentRef: verse.ref,
      currentSurahName: verse.surahName,
      isPlaying: true,
      isLoading: true,
      queue: [verse],
      queueIndex: 0,
    });
    loadAndPlay(verse, () => get()._onEnded())
      .then(() => set({ isLoading: false }))
      .catch(() => set({ isPlaying: false, isLoading: false }));
  },

  playGraph: (verses) => {
    if (verses.length === 0) return;
    const first = verses[0];
    set({
      currentRef: first.ref,
      currentSurahName: first.surahName,
      isPlaying: true,
      isLoading: true,
      queue: verses,
      queueIndex: 0,
    });
    loadAndPlay(first, () => get()._onEnded())
      .then(() => set({ isLoading: false }))
      .catch(() => set({ isPlaying: false, isLoading: false }));
  },

  pause: () => {
    if (_audio) _audio.pause();
    set({ isPlaying: false });
  },

  resume: () => {
    if (!_audio) return;
    _audio
      .play()
      .then(() => set({ isPlaying: true }))
      .catch(() => {});
  },

  stop: () => {
    if (_audio) {
      _audio.pause();
      _audio.src = "";
    }
    set({
      currentRef: null,
      currentSurahName: null,
      isPlaying: false,
      isLoading: false,
      queue: [],
      queueIndex: 0,
    });
  },

  next: () => {
    const { queue, queueIndex } = get();
    const nextIdx = queueIndex + 1;
    if (nextIdx >= queue.length) {
      get().stop();
      return;
    }
    const verse = queue[nextIdx];
    set({
      currentRef: verse.ref,
      currentSurahName: verse.surahName,
      queueIndex: nextIdx,
      isLoading: true,
    });
    loadAndPlay(verse, () => get()._onEnded())
      .then(() => set({ isLoading: false }))
      .catch(() => set({ isPlaying: false, isLoading: false }));
  },

  prev: () => {
    const { queue, queueIndex } = get();
    const prevIdx = queueIndex - 1;
    if (prevIdx < 0) return;
    const verse = queue[prevIdx];
    set({
      currentRef: verse.ref,
      currentSurahName: verse.surahName,
      queueIndex: prevIdx,
      isLoading: true,
    });
    loadAndPlay(verse, () => get()._onEnded())
      .then(() => set({ isLoading: false }))
      .catch(() => set({ isPlaying: false, isLoading: false }));
  },

  _onEnded: () => {
    get().next();
  },
}));
