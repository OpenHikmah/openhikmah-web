import { act, cleanup } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderWithIntl as render } from "../../test-utils/render-with-intl";
import { useCanvasStore } from "@/store/canvas";
import type { Verse, VerseRef } from "@/types/quran";

vi.mock("@xyflow/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@xyflow/react")>();
  return {
    ...actual,
    ReactFlow: () => null,
    Background: () => null,
    BackgroundVariant: { Dots: "dots" },
    MiniMap: () => null,
    Panel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    useReactFlow: () => ({ fitView: vi.fn(), setCenter: vi.fn(), getZoom: vi.fn() }),
    ReactFlowProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

import { HikmahCanvas } from "@/components/canvas/HikmahCanvas";

function verseNode(id: string, ref: string, position = { x: 0, y: 0 }) {
  const verse: Verse = {
    surah: 1,
    ayah: 1,
    ref: ref as VerseRef,
    arabicText: "نص",
    translation: "text",
    surahName: "Al-Fatihah",
    surahNameArabic: "الفاتحة",
  };
  return { id, type: "verse", position, data: verse };
}

function connection(ref: string) {
  return {
    surah: 2,
    ayah: 255,
    ref,
    arabicText: "نص",
    translation: "text",
    surahName: "Al-Baqarah",
    surahNameArabic: "البقرة",
    reason: "reason",
    kind: "thematic",
  };
}

describe("HikmahCanvas expansion node placement", () => {
  beforeEach(() => {
    useCanvasStore.setState({
      nodes: [verseNode("n1", "1:1", { x: 0, y: 0 })] as never,
      edges: [],
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("places a new node near the source's current position, not its position when the expansion started", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([connection("2:255")]),
      })
    );

    render(<HikmahCanvas onSearchOpen={vi.fn()} />);

    act(() => {
      useCanvasStore.getState().setPendingExpand({ nodeId: "n1", ref: "1:1", kind: "thematic" });
    });
    // Let the pendingExpand effect fire and the fetch microtask resolve.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Drag the source node far away before the staggered placement lands.
    act(() => {
      useCanvasStore.setState({
        nodes: useCanvasStore
          .getState()
          .nodes.map((n) => (n.id === "n1" ? { ...n, position: { x: 2000, y: 2000 } } : n)),
      });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });

    const newNode = useCanvasStore.getState().nodes.find((n) => n.id !== "n1");
    expect(newNode).toBeDefined();
    // radialPos fans out within a 460px radius of the source; landing near the
    // dragged-to position (not the stale x:0,y:0 snapshot) confirms the fix.
    expect(newNode!.position.x).toBeGreaterThan(1000);
    expect(newNode!.position.y).toBeGreaterThan(1000);
  });
});
