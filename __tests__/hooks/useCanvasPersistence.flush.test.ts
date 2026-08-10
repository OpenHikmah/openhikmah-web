import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("@xyflow/react", () => ({
  applyNodeChanges: vi.fn((changes: unknown[], nodes: unknown[]) => nodes),
  applyEdgeChanges: vi.fn((changes: unknown[], edges: unknown[]) => edges),
}));

import { useCanvasStore } from "@/store/canvas";
import { useCanvasPersistence, CANVAS_STORAGE_KEY } from "@/hooks/useCanvasPersistence";
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

describe("useCanvasPersistence flush-on-unload", () => {
  beforeEach(() => {
    useCanvasStore.getState().reset();
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not persist an edit before the 800ms debounce elapses", () => {
    renderHook(() => useCanvasPersistence());

    act(() => {
      useCanvasStore.getState().addVerseNode(baseVerse, { x: 0, y: 0 });
    });

    expect(localStorage.getItem(CANVAS_STORAGE_KEY)).toBeNull();
  });

  it("flushes a pending edit to localStorage on pagehide before the debounce fires", () => {
    renderHook(() => useCanvasPersistence());

    act(() => {
      useCanvasStore.getState().addVerseNode(baseVerse, { x: 0, y: 0 });
    });
    expect(localStorage.getItem(CANVAS_STORAGE_KEY)).toBeNull();

    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });

    const saved = JSON.parse(localStorage.getItem(CANVAS_STORAGE_KEY)!);
    expect(saved.nodes).toHaveLength(1);
  });

  it("flushes a pending edit to localStorage on beforeunload before the debounce fires", () => {
    renderHook(() => useCanvasPersistence());

    act(() => {
      useCanvasStore.getState().addVerseNode(baseVerse, { x: 0, y: 0 });
    });

    act(() => {
      window.dispatchEvent(new Event("beforeunload"));
    });

    const saved = JSON.parse(localStorage.getItem(CANVAS_STORAGE_KEY)!);
    expect(saved.nodes).toHaveLength(1);
  });

  it("does not double-write when the debounce timer fires after an unload flush already ran", () => {
    renderHook(() => useCanvasPersistence());

    act(() => {
      useCanvasStore.getState().addVerseNode(baseVerse, { x: 0, y: 0 });
    });
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });

    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
    act(() => {
      vi.advanceTimersByTime(800);
    });

    expect(setItemSpy).not.toHaveBeenCalled();
    setItemSpy.mockRestore();
  });
});
