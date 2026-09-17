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
  _restartCurrentTrack: () => void;
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

// Second, hidden element used only to warm the browser's HTTP cache for the
// next verse while the current one plays — never attached to playback state.
let _prefetchAudio: HTMLAudioElement | null = null;
function prefetchNext(queue: AudioVerse[], index: number) {
  if (typeof window === "undefined") return;
  const next = queue[index + 1];
  if (!next) return;
  const url = getAudioUrl(next.surah, next.ayah, usePreferencesStore.getState().reciter);
  if (!_prefetchAudio) _prefetchAudio = new Audio();
  if (_prefetchAudio.src !== url) {
    _prefetchAudio.src = url;
    _prefetchAudio.load();
  }
}

// Monotonically increasing generation counter. Each play call captures the
// current token; stale .then/.catch callbacks from superseded requests
// check the token and skip their state updates, preventing race conditions
// when the user switches tracks faster than a play() promise settles.
let playGen = 0;

const MAX_LOAD_RETRIES = 2;
const RETRY_DELAY_MS = 600;

// A track can fail to load (404/network/unsupported on the CDN) without the
// `<audio>` element ever firing `ended`. Most such failures are transient
// (a cold CDN path right after switching reciter, a network blip), so retry
// a bounded number of times with a short delay before giving up — without a
// retry, one blip skips straight to the next verse, and since a reciter
// switch makes every following verse a fresh uncached request, blips used to
// cluster right after a switch and looked like several verses skipping in a
// row. Only after retries are exhausted do we treat it like a natural end
// (skip to the next track) so one truly missing ayah doesn't freeze the rest
// of the surah. `token` guards against a superseded track (e.g. the user hit
// next(), or a reciter switch restarted this same verse) still retrying in
// the background.
function loadAndPlay(
  verse: AudioVerse,
  onEnded: () => void,
  token: number,
  retriesLeft = MAX_LOAD_RETRIES
): Promise<void> {
  const a = getAudio();
  a.onended = onEnded;
  a.onerror = () => {
    if (token !== playGen) return;
    console.error(`audio: failed to load ${verse.ref}`, a.error);
    // If the user had paused, a load error must not resume playback on the
    // next track — stop cleanly instead of auto-advancing into autoplay.
    if (!useAudioStore.getState().isPlaying) {
      useAudioStore.getState().stop();
      return;
    }
    if (retriesLeft > 0) {
      setTimeout(() => {
        if (token === playGen) loadAndPlay(verse, onEnded, token, retriesLeft - 1);
      }, RETRY_DELAY_MS);
    } else {
      onEnded();
    }
  };
  a.src = getAudioUrl(verse.surah, verse.ayah, usePreferencesStore.getState().reciter);
  a.load();
  return a.play();
}

export const useAudioStore = create<AudioStore>((set, get) => {
  // Shared by every method that starts a track: loads it, then resolves/rejects
  // against the generation token captured at call time (see `playGen` above).
  const startTrack = (verse: AudioVerse) => {
    const token = ++playGen;
    loadAndPlay(verse, () => get()._onEnded(), token)
      .then(() => {
        if (token === playGen) set({ isLoading: false });
      })
      .catch(() => {
        if (token === playGen) set({ isPlaying: false, isLoading: false });
      });
    const { queue, queueIndex } = get();
    prefetchNext(queue, queueIndex);
  };

  return {
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
      startTrack(verse);
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
      startTrack(first);
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
      startTrack(verse);
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
      startTrack(verse);
    },

    _onEnded: () => {
      get().next();
    },

    _restartCurrentTrack: () => {
      const { queue, queueIndex } = get();
      const verse = queue[queueIndex];
      if (!verse) return;
      set({ isLoading: true });
      startTrack(verse);
    },
  };
});

// Changing reciter mid-playback should be heard immediately, not just on the
// next verse — restart only the currently-playing track (queue position is
// unchanged). A paused track picks up the new reciter next time the user
// presses play, same as before.
if (typeof window !== "undefined") {
  usePreferencesStore.subscribe((state, prevState) => {
    if (state.reciter === prevState.reciter) return;
    const { currentRef, isPlaying } = useAudioStore.getState();
    if (currentRef && isPlaying) useAudioStore.getState()._restartCurrentTrack();
  });
}
