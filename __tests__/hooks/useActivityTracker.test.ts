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

function savedCanvasWith(count: number) {
  return {
    v: 1 as const,
    nodes: Array.from({ length: count }, (_, i) => ({
      id: `node-${i + 1}`,
      x: i * 300,
      y: 0,
      verse: {
        ...baseVerse,
        ayah: 255 + i,
        ref: `2:${255 + i}` as Verse["ref"],
      },
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

  it("fires an activity POST when a node is genuinely added while mounted", () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    vi.stubGlobal("fetch", fetchMock);

    renderHook(() => useActivityTracker());

    act(() => {
      useCanvasStore.getState().addVerseNode(baseVerse, { x: 0, y: 0 });
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/social/activity",
      expect.objectContaining({
        body: expect.stringContaining("verse_added"),
      })
    );
  });

  it("resumes firing for genuine additions after a restore", () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    vi.stubGlobal("fetch", fetchMock);

    renderHook(() => useActivityTracker());

    act(() => {
      useCanvasStore.getState().restoreCanvas(savedCanvasWith(2));
    });
    expect(fetchMock).not.toHaveBeenCalled();

    act(() => {
      useCanvasStore.getState().addVerseNode(baseVerse, { x: 0, y: 0 });
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/social/activity",
      expect.objectContaining({ body: expect.stringContaining("verse_added") })
    );
  });
});
