import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useAudioStore, type AudioVerse } from "@/store/audio";

const verseA: AudioVerse = { ref: "2:255", surah: 2, ayah: 255, surahName: "Al-Baqarah" };
const verseB: AudioVerse = { ref: "1:1", surah: 1, ayah: 1, surahName: "Al-Fatiha" };
const verseC: AudioVerse = { ref: "112:1", surah: 112, ayah: 1, surahName: "Al-Ikhlas" };

// jsdom's HTMLMediaElement.play()/pause()/load() are stubs that throw "not
// implemented" — replace them with controllable mocks so tests can decide
// exactly when a play() promise settles (needed to exercise the playGen
// race guard, which depends on settlement order).
let pendingPlays: Array<{ resolve: () => void; reject: (e: unknown) => void }>;

beforeEach(() => {
  pendingPlays = [];
  window.HTMLMediaElement.prototype.play = vi.fn(
    () =>
      new Promise<void>((resolve, reject) => {
        pendingPlays.push({ resolve, reject });
      })
  );
  window.HTMLMediaElement.prototype.pause = vi.fn();
  window.HTMLMediaElement.prototype.load = vi.fn();

  useAudioStore.setState({
    currentRef: null,
    currentSurahName: null,
    isPlaying: false,
    isLoading: false,
    queue: [],
    queueIndex: 0,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("audio store", () => {
  it("playVerse synchronously sets the current verse, playing, and loading state", () => {
    useAudioStore.getState().playVerse(verseA);
    const s = useAudioStore.getState();
    expect(s.currentRef).toBe("2:255");
    expect(s.currentSurahName).toBe("Al-Baqarah");
    expect(s.isPlaying).toBe(true);
    expect(s.isLoading).toBe(true);
    expect(s.queue).toEqual([verseA]);
    expect(s.queueIndex).toBe(0);
  });

  it("playVerse clears isLoading once play() resolves", async () => {
    useAudioStore.getState().playVerse(verseA);
    pendingPlays[0].resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(useAudioStore.getState().isLoading).toBe(false);
    expect(useAudioStore.getState().isPlaying).toBe(true);
  });

  it("playVerse clears isPlaying and isLoading if play() rejects (e.g. autoplay blocked)", async () => {
    useAudioStore.getState().playVerse(verseA);
    pendingPlays[0].reject(new Error("NotAllowedError"));
    await Promise.resolve();
    await Promise.resolve();
    expect(useAudioStore.getState().isPlaying).toBe(false);
    expect(useAudioStore.getState().isLoading).toBe(false);
  });

  it("playGraph queues all verses starting at the first, and clears isLoading on resolve", async () => {
    useAudioStore.getState().playGraph([verseA, verseB, verseC]);
    let s = useAudioStore.getState();
    expect(s.currentRef).toBe("2:255");
    expect(s.queue).toEqual([verseA, verseB, verseC]);
    expect(s.queueIndex).toBe(0);

    pendingPlays[0].resolve();
    await Promise.resolve();
    await Promise.resolve();
    s = useAudioStore.getState();
    expect(s.isLoading).toBe(false);
  });

  it("playGraph is a no-op for an empty verse list", () => {
    const before = useAudioStore.getState();
    useAudioStore.getState().playGraph([]);
    expect(useAudioStore.getState()).toEqual(before);
  });

  it("a stale play() resolution does not clobber state from a newer play() call (playGen race guard)", async () => {
    // Rapidly switch tracks before the first play() settles — mirrors a user
    // skipping tracks faster than playback can start. B is still loading when
    // A's stale promise settles: this is the only ordering where the guard's
    // effect is observable — if settled in the other order, isLoading would
    // land on the same value (false) whether or not the guard exists.
    useAudioStore.getState().playVerse(verseA);
    useAudioStore.getState().playVerse(verseB);
    expect(pendingPlays).toHaveLength(2);
    expect(useAudioStore.getState().isLoading).toBe(true);

    // The stale (A) call settles first, while B is still loading. Without the
    // playGen check, A's .then would incorrectly clear isLoading for B's
    // still-in-flight play().
    pendingPlays[0].resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(useAudioStore.getState()).toMatchObject({ currentRef: "1:1", isLoading: true });

    // B's own play() now settles — this is what should actually clear isLoading.
    pendingPlays[1].resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(useAudioStore.getState()).toMatchObject({ currentRef: "1:1", isLoading: false });
  });

  it("a stale settlement through next() does not clobber state from a newer next() call", async () => {
    useAudioStore.getState().playGraph([verseA, verseB, verseC]);
    pendingPlays[0].resolve();
    await Promise.resolve();
    await Promise.resolve();

    // Two rapid next() calls before either play() settles.
    useAudioStore.getState().next(); // -> verseB, token N
    useAudioStore.getState().next(); // -> verseC, token N+1 (stale: pendingPlays[2])
    expect(pendingPlays).toHaveLength(3);
    expect(useAudioStore.getState()).toMatchObject({ currentRef: "112:1", isLoading: true });

    // The stale (verseB) call settles first — must not clear isLoading for verseC.
    pendingPlays[1].resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(useAudioStore.getState()).toMatchObject({ currentRef: "112:1", isLoading: true });

    pendingPlays[2].resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(useAudioStore.getState()).toMatchObject({ currentRef: "112:1", isLoading: false });
  });

  it("a stale play() rejection does not clobber isPlaying/isLoading from a newer call", async () => {
    useAudioStore.getState().playVerse(verseA);
    useAudioStore.getState().playVerse(verseB);

    // Newer call succeeds and is actively playing.
    pendingPlays[1].resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(useAudioStore.getState()).toMatchObject({ isPlaying: true, isLoading: false });

    // Stale call's play() promise rejects after the fact — must not stop playback.
    pendingPlays[0].reject(new Error("stale"));
    await Promise.resolve();
    await Promise.resolve();
    expect(useAudioStore.getState()).toMatchObject({
      currentRef: "1:1",
      isPlaying: true,
      isLoading: false,
    });
  });

  it("next() advances the queue and clears isLoading once settled", async () => {
    useAudioStore.getState().playGraph([verseA, verseB, verseC]);
    pendingPlays[0].resolve();
    await Promise.resolve();
    await Promise.resolve();

    useAudioStore.getState().next();
    let s = useAudioStore.getState();
    expect(s.currentRef).toBe("1:1");
    expect(s.queueIndex).toBe(1);
    expect(s.isLoading).toBe(true);

    pendingPlays[1].resolve();
    await Promise.resolve();
    await Promise.resolve();
    s = useAudioStore.getState();
    expect(s.isLoading).toBe(false);
  });

  it("next() at the end of the queue stops playback instead of advancing", async () => {
    useAudioStore.getState().playVerse(verseA); // single-item queue
    pendingPlays[0].resolve();
    await Promise.resolve();
    await Promise.resolve();

    useAudioStore.getState().next();
    const s = useAudioStore.getState();
    expect(s.currentRef).toBeNull();
    expect(s.isPlaying).toBe(false);
    expect(s.queue).toEqual([]);
  });

  it("prev() moves back through the queue", async () => {
    useAudioStore.getState().playGraph([verseA, verseB, verseC]);
    pendingPlays[0].resolve();
    await Promise.resolve();
    await Promise.resolve();
    useAudioStore.getState().next();
    pendingPlays[1].resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(useAudioStore.getState().currentRef).toBe("1:1");

    useAudioStore.getState().prev();
    expect(useAudioStore.getState().currentRef).toBe("2:255");
    expect(useAudioStore.getState().queueIndex).toBe(0);
  });

  it("prev() at the start of the queue is a no-op", () => {
    useAudioStore.getState().playVerse(verseA);
    useAudioStore.getState().prev();
    expect(useAudioStore.getState().currentRef).toBe("2:255");
    expect(useAudioStore.getState().queueIndex).toBe(0);
  });

  it("_onEnded advances to the next track (used as the <audio> onended handler)", async () => {
    useAudioStore.getState().playGraph([verseA, verseB]);
    pendingPlays[0].resolve();
    await Promise.resolve();
    await Promise.resolve();

    useAudioStore.getState()._onEnded();
    expect(useAudioStore.getState().currentRef).toBe("1:1");
  });

  it("resume() sets isPlaying once play() resolves", async () => {
    useAudioStore.getState().playVerse(verseA); // creates the module-level Audio instance
    pendingPlays[0].resolve();
    await Promise.resolve();
    await Promise.resolve();
    useAudioStore.getState().pause();
    expect(useAudioStore.getState().isPlaying).toBe(false);

    useAudioStore.getState().resume();
    expect(pendingPlays).toHaveLength(2);
    pendingPlays[1].resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(useAudioStore.getState().isPlaying).toBe(true);
  });

  it("pause() stops playback state without clearing the queue", () => {
    useAudioStore.getState().playVerse(verseA);
    useAudioStore.getState().pause();
    const s = useAudioStore.getState();
    expect(s.isPlaying).toBe(false);
    expect(s.currentRef).toBe("2:255");
    expect(window.HTMLMediaElement.prototype.pause).toHaveBeenCalled();
  });

  it("stop() clears the current track, queue, and playback state", () => {
    useAudioStore.getState().playVerse(verseA);
    useAudioStore.getState().stop();
    const s = useAudioStore.getState();
    expect(s.currentRef).toBeNull();
    expect(s.currentSurahName).toBeNull();
    expect(s.isPlaying).toBe(false);
    expect(s.isLoading).toBe(false);
    expect(s.queue).toEqual([]);
    expect(s.queueIndex).toBe(0);
  });
});
