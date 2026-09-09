import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { Verse } from "@/types/quran";

const { mockUsePathname } = vi.hoisted(() => ({ mockUsePathname: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: mockUsePathname }));

// Match repo precedent (__tests__/store/canvas.test.ts) — keep the heavy
// @xyflow/react module out of the fast unit suite.
vi.mock("@xyflow/react", () => ({
  applyNodeChanges: vi.fn((_changes: unknown[], nodes: unknown[]) => nodes),
  applyEdgeChanges: vi.fn((_changes: unknown[], edges: unknown[]) => edges),
}));

// Real store on purpose — this file exists to prove the hook does NOT re-render
// its consumers on canvas-store changes while off the canvas route. The mocked
// store in useMobileNavVisible.test.ts can't express subscription behaviour.
import { useMobileNavVisible } from "@/hooks/useMobileNavVisible";
import { useCanvasStore } from "@/store/canvas";

const AYAT_AL_KURSI: Verse = {
  surah: 2,
  ayah: 255,
  ref: "2:255",
  arabicText: "اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ",
  translation: "Allah - there is no deity except Him, the Ever-Living, the Sustainer of existence.",
  surahName: "Al-Baqarah",
  surahNameArabic: "البقرة",
};
const AL_FATIHA: Verse = {
  surah: 1,
  ayah: 1,
  ref: "1:1",
  arabicText: "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ",
  translation: "In the name of Allah, the Entirely Merciful, the Especially Merciful.",
  surahName: "Al-Fatihah",
  surahNameArabic: "الفاتحة",
};

beforeEach(() => {
  vi.useFakeTimers();
  useCanvasStore.getState().reset();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("useMobileNavVisible subscription", () => {
  it("does not re-render when canvas nodes change off the canvas route", () => {
    mockUsePathname.mockReturnValue("/search");
    let renders = 0;
    const { result } = renderHook(() => {
      renders++;
      return useMobileNavVisible();
    });

    const baseline = renders;
    expect(result.current).toBe(true);

    act(() => {
      useCanvasStore.getState().addVerseNode(AYAT_AL_KURSI);
    });

    expect(renders).toBe(baseline);
    expect(result.current).toBe(true);
  });

  it("re-renders on the first canvas node when on the canvas route", () => {
    mockUsePathname.mockReturnValue("/canvas");
    let renders = 0;
    const { result } = renderHook(() => {
      renders++;
      return useMobileNavVisible();
    });

    const baseline = renders;
    expect(result.current).toBe(true);

    act(() => {
      useCanvasStore.getState().addVerseNode(AYAT_AL_KURSI);
    });

    expect(renders).toBeGreaterThan(baseline);
    expect(result.current).toBe(false);
  });

  it("does not re-render on subsequent canvas nodes (only the 0<->1 boundary matters)", () => {
    mockUsePathname.mockReturnValue("/canvas");
    let renders = 0;
    const { result } = renderHook(() => {
      renders++;
      return useMobileNavVisible();
    });

    act(() => {
      useCanvasStore.getState().addVerseNode(AYAT_AL_KURSI);
    });
    const afterFirst = renders;
    expect(result.current).toBe(false);

    act(() => {
      useCanvasStore.getState().addVerseNode(AL_FATIHA);
    });

    expect(renders).toBe(afterFirst);
    expect(result.current).toBe(false);
  });
});
