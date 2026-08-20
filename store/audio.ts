"use client";

import { create } from "zustand";
import { getAudioUrl } from "@/lib/quran/audio";
import { usePreferencesStore } from "@/store/preferences";

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

// Monotonically increasing generation counter. Each play call captures the
// current token; stale .then/.catch callbacks from superseded requests
// check the token and skip their state updates, preventing race conditions
// when the user switches tracks faster than a play() promise settles.
let playGen = 0;

// A track can fail to load (404/network/unsupported on the CDN) without the
// `<audio>` element ever firing `ended` — with no `onerror` handler that
// silently freezes the whole queue on the broken track forever. Treat a load
// error the same as a natural end (skip to the next track) so one missing
// ayah doesn't kill playback for the rest of the surah. `error` and `ended`
// are mutually exclusive outcomes of a single load per the HTMLMediaElement
// spec, so no extra guard is needed against both firing for the same track.
function loadAndPlay(verse: AudioVerse, onEnded: () => void) {
  const a = getAudio();
  a.onended = onEnded;
  a.onerror = () => {
    console.error(`audio: failed to load ${verse.ref}`, a.error);
    onEnded();
  };
  a.src = getAudioUrl(verse.surah, verse.ayah, usePreferencesStore.getState().reciter);
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
    const token = ++playGen;
    set({
      currentRef: verse.ref,
      currentSurahName: verse.surahName,
      isPlaying: true,
      isLoading: true,
      queue: [verse],
      queueIndex: 0,
    });
    loadAndPlay(verse, () => get()._onEnded())
      .then(() => {
        if (token === playGen) set({ isLoading: false });
      })
      .catch(() => {
        if (token === playGen) set({ isPlaying: false, isLoading: false });
      });
  },

  playGraph: (verses) => {
    if (verses.length === 0) return;
    const first = verses[0];
    const token = ++playGen;
    set({
      currentRef: first.ref,
      currentSurahName: first.surahName,
      isPlaying: true,
      isLoading: true,
      queue: verses,
      queueIndex: 0,
    });
    loadAndPlay(first, () => get()._onEnded())
      .then(() => {
        if (token === playGen) set({ isLoading: false });
      })
      .catch(() => {
        if (token === playGen) set({ isPlaying: false, isLoading: false });
      });
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
    const token = ++playGen;
    set({
      currentRef: verse.ref,
      currentSurahName: verse.surahName,
      queueIndex: nextIdx,
      isLoading: true,
    });
    loadAndPlay(verse, () => get()._onEnded())
      .then(() => {
        if (token === playGen) set({ isLoading: false });
      })
      .catch(() => {
        if (token === playGen) set({ isPlaying: false, isLoading: false });
      });
  },

  prev: () => {
    const { queue, queueIndex } = get();
    const prevIdx = queueIndex - 1;
    if (prevIdx < 0) return;
    const verse = queue[prevIdx];
    const token = ++playGen;
    set({
      currentRef: verse.ref,
      currentSurahName: verse.surahName,
      queueIndex: prevIdx,
      isLoading: true,
    });
    loadAndPlay(verse, () => get()._onEnded())
      .then(() => {
        if (token === playGen) set({ isLoading: false });
      })
      .catch(() => {
        if (token === playGen) set({ isPlaying: false, isLoading: false });
      });
  },

  _onEnded: () => {
    get().next();
  },
}));
