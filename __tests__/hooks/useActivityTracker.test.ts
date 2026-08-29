import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("@xyflow/react", () => ({
  applyNodeChanges: vi.fn((changes: unknown[], nodes: unknown[]) => nodes),
  applyEdgeChanges: vi.fn((changes: unknown[], edges: unknown[]) => edges),
}));

import { useCanvasStore } from "@/store/canvas";
import { useAuthStore } from "@/store/auth";
import { useActivityTracker } from "@/hooks/useActivityTracker";
import type { Verse } from "@/types/quran";

const baseVerse: Verse = {
  surah: 2,
  ayah: 255,
  ref: "2:255",
  arabicText: "اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ",
  translation: "Allah — there is no deity except Him.",
  surahName: "Al-Baqarah",
  surahNameArabic: "البقرة",
};

// Every generated node reuses baseVerse's real ref/text — only id and position
// vary — so no fixture ever pairs a synthetic ref with mismatched Arabic/translation.
function savedCanvasWith(count: number) {
  return {
    v: 1 as const,
    nodes: Array.from({ length: count }, (_, i) => ({
      id: `node-${i + 1}`,
      x: i * 300,
      y: 0,
      verse: baseVerse,
    })),
    edges: [],
  };
}

describe("useActivityTracker restore vs. genuine activity", () => {
  beforeEach(() => {
    useCanvasStore.getState().reset();
    useAuthStore.setState({ accessToken: "test-token" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not fire an activity POST when restoreCanvas repopulates the store", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    vi.stubGlobal("fetch", fetchMock);

    renderHook(() => useActivityTracker());

    act(() => {
      useCanvasStore.getState().restoreCanvas(savedCanvasWith(3));
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not fire an activity POST for nodes already present when the hook mounts", () => {
    useCanvasStore.getState().addVerseNode(baseVerse, { x: 0, y: 0 });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    vi.stubGlobal("fetch", fetchMock);

    renderHook(() => useActivityTracker());

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fires an activity POST when a node is genuinely added while mounted", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    vi.stubGlobal("fetch", fetchMock);

    renderHook(() => useActivityTracker());

    await act(async () => {
      useCanvasStore.getState().addVerseNode(baseVerse, { x: 0, y: 0 });
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/social/activity",
      expect.objectContaining({
        body: expect.stringContaining("verse_added"),
      })
    );
  });

  it("does not fire an activity POST when appendWorkspace merges a loaded workspace", () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    vi.stubGlobal("fetch", fetchMock);

    renderHook(() => useActivityTracker());

    act(() => {
      useCanvasStore.getState().appendWorkspace(savedCanvasWith(2));
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("still delivers the first add when it happens before the auth token arrives", async () => {
    useAuthStore.setState({ accessToken: null });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ streak: 1, longestStreak: 1, activityDate: "2026-08-28" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    renderHook(() => useActivityTracker());

    act(() => {
      useCanvasStore.getState().addVerseNode(baseVerse, { x: 0, y: 0 });
    });
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      useAuthStore.setState({ accessToken: "late-token" });
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/social/activity",
      expect.objectContaining({ body: expect.stringContaining("verse_added") })
    );
  });

  it("resumes firing for genuine additions after a restore", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    vi.stubGlobal("fetch", fetchMock);

    renderHook(() => useActivityTracker());

    act(() => {
      useCanvasStore.getState().restoreCanvas(savedCanvasWith(2));
    });
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      useCanvasStore.getState().addVerseNode(baseVerse, { x: 0, y: 0 });
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/social/activity",
      expect.objectContaining({ body: expect.stringContaining("verse_added") })
    );
  });
});
