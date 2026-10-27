import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { screen, fireEvent, cleanup, act } from "@testing-library/react";
import type { NodeProps } from "@xyflow/react";
import { renderWithIntl } from "@/__tests__/test-utils/render-with-intl";
import { useCanvasStore } from "@/store/canvas";
import { usePreferencesStore } from "@/store/preferences";
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

  it("shows no connection count label on the card", () => {
    const sourceId = useCanvasStore.getState().addVerseNode(baseVerse, { x: 0, y: 0 });
    const targetId = useCanvasStore
      .getState()
      .addVerseNode({ ...baseVerse, ref: "1:1" as const, surah: 1, ayah: 1 }, { x: 300, y: 0 });
    renderNode(nodeProps(sourceId, baseVerse));

    act(() => {
      useCanvasStore.getState().addConnectionEdge({
        id: "e1",
        source: sourceId,
        target: targetId,
        type: "hikmah",
        data: { kind: "thematic", label: "t" },
      });
    });

    expect(screen.queryByText(/connected/i)).not.toBeInTheDocument();
  });
});

describe("VerseNode — reading layout", () => {
  beforeEach(() => {
    useCanvasStore.getState().reset();
    usePreferencesStore.getState().setCanvasPrefs({ showArabic: true });
  });

  afterEach(() => {
    cleanup();
    usePreferencesStore.getState().setCanvasPrefs({ showArabic: true });
  });

  it("hides the Arabic text when Arabic on cards is off, keeping the translation", () => {
    const id = useCanvasStore.getState().addVerseNode(baseVerse, { x: 0, y: 0 });
    renderNode(nodeProps(id, baseVerse));
    expect(screen.getByText(baseVerse.arabicText)).toBeInTheDocument();

    act(() => usePreferencesStore.getState().setCanvasPrefs({ showArabic: false }));

    expect(screen.queryByText(baseVerse.arabicText)).not.toBeInTheDocument();
    expect(screen.getByText(baseVerse.translation)).toBeInTheDocument();
  });

  it("opens the verse thread on click and closes it on a second click", () => {
    const id = useCanvasStore.getState().addVerseNode(baseVerse, { x: 0, y: 0 });
    renderNode(nodeProps(id, baseVerse));
    const card = screen.getByRole("button", { name: "Al-Baqarah 2:255" });

    fireEvent.click(card);
    expect(useCanvasStore.getState().sidebarContent).toEqual({ type: "node", nodeId: id });
    expect(card).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(card);
    expect(useCanvasStore.getState().sidebarContent).toBeNull();
  });

  it("fades when the reading panel shows a verse it is not connected to", () => {
    const id = useCanvasStore.getState().addVerseNode(baseVerse, { x: 0, y: 0 });
    const otherId = useCanvasStore
      .getState()
      .addVerseNode({ ...baseVerse, ref: "1:1" as const, surah: 1, ayah: 1 }, { x: 300, y: 0 });
    renderNode(nodeProps(id, baseVerse));
    const card = screen.getByRole("button", { name: "Al-Baqarah 2:255" });
    expect(card.className).not.toMatch(/opacity-30/);

    act(() => useCanvasStore.getState().setSidebarContent({ type: "node", nodeId: otherId }));
    expect(card.className).toMatch(/opacity-30/);
  });
});
