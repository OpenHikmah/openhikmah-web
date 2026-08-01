import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { screen, fireEvent, cleanup, act } from "@testing-library/react";
import type { NodeProps } from "@xyflow/react";
import { renderWithIntl } from "@/__tests__/test-utils/render-with-intl";
import { useCanvasStore } from "@/store/canvas";
import type { Verse } from "@/types/quran";
import { VerseNode } from "@/components/canvas/VerseNode";
import { TooltipProvider } from "@/components/ui";

vi.mock("@xyflow/react", () => ({
  Handle: () => null,
  Position: { Left: "left", Right: "right" },
  useReactFlow: () => ({ setCenter: vi.fn(), getZoom: () => 1 }),
}));

const baseVerse: Verse = {
  surah: 2,
  ayah: 255,
  ref: "2:255",
  arabicText: "اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ",
  translation: "Allah — there is no deity except Him.",
  surahName: "Al-Baqarah",
  surahNameArabic: "البقرة",
};

function nodeProps(id: string, verse: Verse): NodeProps {
  return { id, data: verse, selected: false } as unknown as NodeProps;
}

function renderNode(props: NodeProps) {
  return renderWithIntl(
    <TooltipProvider>
      <VerseNode {...props} />
    </TooltipProvider>
  );
}

// These prove the fix for the bug CodeRabbit flagged on this PR: VerseNode used
// to read getDuplicateNodeIds/getExpansionCounts through a selector on the
// (stable, never-changing) getter function itself, so a change to the
// underlying derived maps never re-rendered the node — it only looked "live"
// because unrelated raw-state subscriptions happened to force frequent
// re-renders. Now it subscribes to the maps directly (via useShallow), so
// these must update with no prop change at all.
describe("VerseNode — reacts to derived-index changes with no prop change", () => {
  beforeEach(() => {
    useCanvasStore.getState().reset();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows the duplicate-jump affordance once another node with the same ref is added after mount", () => {
    const id = useCanvasStore.getState().addVerseNode(baseVerse, { x: 0, y: 0 });
    renderNode(nodeProps(id, baseVerse));

    expect(screen.queryByRole("button", { name: /jump to duplicate/i })).not.toBeInTheDocument();

    act(() => {
      useCanvasStore.getState().addVerseNode(baseVerse, { x: 300, y: 0 });
    });

    expect(screen.getByRole("button", { name: /jump to duplicate/i })).toBeInTheDocument();
  });

  it("updates the expand menu's found-count once an edge is added after mount", () => {
    const sourceId = useCanvasStore.getState().addVerseNode(baseVerse, { x: 0, y: 0 });
    const targetId = useCanvasStore
      .getState()
      .addVerseNode({ ...baseVerse, ref: "1:1" as const, surah: 1, ayah: 1 }, { x: 300, y: 0 });
    renderNode(nodeProps(sourceId, baseVerse));

    fireEvent.click(screen.getByRole("button", { name: /expand connections/i }));
    expect(screen.getByText(/by theme/i).textContent).not.toMatch(/found/i);

    act(() => {
      useCanvasStore.getState().addConnectionEdge({
        id: "e1",
        source: sourceId,
        target: targetId,
        type: "hikmah",
        data: { kind: "thematic", label: "t" },
      });
    });

    expect(screen.getByText(/by theme/i).textContent).toMatch(/1 found/i);
  });
});
