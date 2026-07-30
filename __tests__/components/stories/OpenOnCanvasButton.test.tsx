import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Verse } from "@/types/quran";

vi.mock("@xyflow/react", () => ({
  applyNodeChanges: vi.fn((changes: unknown[], nodes: unknown[]) => nodes),
  applyEdgeChanges: vi.fn((changes: unknown[], edges: unknown[]) => edges),
}));

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));

import { useCanvasStore } from "@/store/canvas";
import { OpenOnCanvasButton } from "@/app/stories/[slug]/OpenOnCanvasButton";

function verse(ref: string): Verse {
  const [s, a] = ref.split(":");
  return {
    surah: Number(s),
    ayah: Number(a),
    ref: ref as Verse["ref"],
    arabicText: "نص",
    translation: "text",
    surahName: "Surah",
    surahNameArabic: "سورة",
  };
}

describe("OpenOnCanvasButton", () => {
  beforeEach(() => {
    useCanvasStore.getState().reset();
    mockPush.mockReset();
  });

  it("adds every verse to the canvas and navigates there", () => {
    const verses = [verse("12:4"), verse("12:5"), verse("12:6")];
    render(<OpenOnCanvasButton verses={verses} />);

    fireEvent.click(screen.getByRole("button", { name: /open on canvas/i }));

    expect(useCanvasStore.getState().nodes).toHaveLength(3);
    expect(mockPush).toHaveBeenCalledWith("/canvas");
  });

  it("does not add a duplicate node for a verse already on the canvas", () => {
    useCanvasStore.getState().addVerseNode(verse("12:4"), { x: 0, y: 0 });
    const verses = [verse("12:4"), verse("12:5")];
    render(<OpenOnCanvasButton verses={verses} />);

    fireEvent.click(screen.getByRole("button", { name: /open on canvas/i }));

    expect(useCanvasStore.getState().nodes).toHaveLength(2);
  });

  it("a second click adds no further nodes (idempotent)", () => {
    const verses = [verse("12:4"), verse("12:5")];
    render(<OpenOnCanvasButton verses={verses} />);

    const button = screen.getByRole("button", { name: /open on canvas/i });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(useCanvasStore.getState().nodes).toHaveLength(2);
  });
});
