import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@xyflow/react", () => ({
  applyNodeChanges: vi.fn((_changes: unknown[], nodes: unknown[]) => nodes),
  applyEdgeChanges: vi.fn((_changes: unknown[], edges: unknown[]) => edges),
}));

import { useCanvasStore, serializeCanvas, selectFocus } from "@/store/canvas";
import { NODE_WIDTH, COLUMN_GAP, PLACEHOLDER_HEIGHT } from "@/lib/canvas/canvas-layout";
import type { Verse, VerseRef } from "@/types/quran";
import type { Node } from "@xyflow/react";

const COL = NODE_WIDTH + COLUMN_GAP;
const H = 200;

function verse(ref: VerseRef, arabicText: string): Verse {
  const [surah, ayah] = ref.split(":").map(Number);
  return {
    surah,
    ayah,
    ref,
    arabicText,
    translation: "translation",
    surahName: "Al-Baqarah",
    surahNameArabic: "البقرة",
  };
}

const V153 = verse(
  "2:153",
  "يَٰٓأَيُّهَا ٱلَّذِينَ ءَامَنُوا۟ ٱسْتَعِينُوا۟ بِٱلصَّبْرِ وَٱلصَّلَوٰةِ"
);
const V45 = verse("2:45", "وَٱسْتَعِينُوا۟ بِٱلصَّبْرِ وَٱلصَّلَوٰةِ");
const V155 = verse("2:155", "وَلَنَبْلُوَنَّكُم بِشَىْءٍۢ مِّنَ ٱلْخَوْفِ وَٱلْجُوعِ");

function card(id: string, data: Verse, x = 0, y = 0): Node {
  return {
    id,
    type: "verse",
    position: { x, y },
    data: data as never,
    measured: { width: NODE_WIDTH, height: H },
  };
}

const store = () => useCanvasStore.getState();

describe("canvas store — placement and layout", () => {
  beforeEach(() => {
    store().reset();
  });

  it("marks a card moved by hand only when the user drags it", () => {
    store().setNodes([card("a", V153), card("b", V45)]);
    store().onNodesChange([{ type: "position", id: "a", dragging: true }]);
    store().onNodesChange([{ type: "position", id: "b", position: { x: 5, y: 5 } }]);
    const [a, b] = store().nodes;
    expect((a.data as unknown as Verse).pinned).toBe(true);
    expect((b.data as unknown as Verse).pinned).toBeUndefined();
  });

  it("puts placeholders in a column beside the source and keeps them out of saves", () => {
    store().setNodes([card("a", V153)]);
    const ids = store().addPlaceholders("a", "thematic", 3, H);

    const placeholders = store().nodes.filter((n) => ids.includes(n.id));
    expect(placeholders.map((n) => n.position.x)).toEqual([COL, COL, COL]);
    expect(placeholders[1].position.y - placeholders[0].position.y).toBe(PLACEHOLDER_HEIGHT + 20);
    expect(store().edges).toHaveLength(3);

    const saved = serializeCanvas(store().nodes, store().edges);
    expect(saved.nodes.map((n) => n.id)).toEqual(["a"]);
    expect(saved.edges).toHaveLength(0);
    expect(store().getExpansionCounts("a")).toEqual({});
  });

  it("does not count placeholder lines once a real connection is added beside them", () => {
    store().setNodes([card("a", V153), card("b", V45)]);
    store().addPlaceholders("a", "thematic", 2, H);

    const result = store().addConnectionEdge({
      id: "edge-a-b",
      source: "a",
      target: "b",
      type: "hikmah",
      data: { kind: "thematic", label: "", reason: "r" },
    });

    expect(result).toBe("added");
    expect(store().edges).toHaveLength(3);
    expect(store().getExpansionCounts("a")).toEqual({ thematic: 1 });
  });

  it("turns a placeholder into a verse card in the same place, linked to its source", () => {
    store().setNodes([card("a", V153)]);
    const [ph] = store().addPlaceholders("a", "thematic", 1, H);
    const at = store().getNodeById(ph)!.position;

    const id = store().fillPlaceholder(ph, V45, "a");
    const filled = store().getNodeById(id)!;
    expect(filled.type).toBe("verse");
    expect(filled.position).toEqual(at);
    expect((filled.data as unknown as Verse).placedFrom).toBe("a");
    expect(store().getNodeById(ph)).toBeUndefined();
    expect(store().edges).toHaveLength(0);
  });

  it("re-runs the column layout but keeps cards moved by hand", () => {
    store().setNodes([
      card("a", V153),
      card("b", { ...V45, placedFrom: "a" }, 999, 999),
      card("c", { ...V155, placedFrom: "a", pinned: true }, -500, -500),
    ]);
    store().relayout(H);
    const pos = (id: string) => store().getNodeById(id)!.position;
    expect(pos("b").x).toBe(COL);
    expect(pos("c")).toEqual({ x: -500, y: -500 });

    store().resetLayout(H);
    expect(pos("c").x).toBe(COL);
    expect((store().getNodeById("c")!.data as unknown as Verse).pinned).toBe(false);
    expect(store().layoutToken).toBe(2);
  });

  it("clears the canvas and undoes the clear", () => {
    store().setNodes([card("a", V153), card("b", V45)]);
    store().setEdges([
      {
        id: "e1",
        source: "a",
        target: "b",
        type: "hikmah",
        data: { kind: "thematic", label: "", reason: "r" },
      },
    ]);

    store().clearCanvas();
    expect(store().nodes).toHaveLength(0);
    expect(store().clearedSnapshot?.nodes).toHaveLength(2);

    store().undoClear();
    expect(store().nodes.map((n) => n.id)).toEqual(["a", "b"]);
    expect(store().edges).toHaveLength(1);
    expect(store().clearedSnapshot).toBeNull();
  });

  it("drops the undo once a new verse is added after a clear", () => {
    store().setNodes([card("a", V153)]);
    store().clearCanvas();
    store().addVerseNode(V45, { x: 0, y: 0 });
    expect(store().clearedSnapshot).toBeNull();
  });
});

describe("selectFocus", () => {
  beforeEach(() => {
    store().reset();
    store().setNodes([card("a", V153), card("b", V45), card("c", V155)]);
    store().setEdges([
      {
        id: "e1",
        source: "a",
        target: "b",
        type: "hikmah",
        data: { kind: "thematic", label: "", reason: "r" },
      },
    ]);
  });

  it("is empty when nothing is open", () => {
    expect(selectFocus(store())).toBeNull();
  });

  it("covers a verse and its connections for the verse thread", () => {
    store().setSidebarContent({ type: "node", nodeId: "a" });
    const f = selectFocus(store())!;
    expect([...f.nodes].sort()).toEqual(["a", "b"]);
    expect(f.selected).toBe("a");
    expect(f.nodes.has("c")).toBe(false);
  });

  it("covers the two verses of an open connection", () => {
    store().setSidebarContent({ type: "edge", edgeId: "e1", contextNodeId: "a" });
    const f = selectFocus(store())!;
    expect([...f.paired].sort()).toEqual(["a", "b"]);
    expect([...f.edges]).toEqual(["e1"]);
  });

  it("follows a running expansion until the reading panel opens", () => {
    store().setExpansionFocus({ sourceId: "c", nodeIds: [] });
    expect(selectFocus(store())!.selected).toBe("c");
    store().setSidebarContent({ type: "node", nodeId: "a" });
    expect(store().expansionFocus).toBeNull();
    expect(selectFocus(store())!.selected).toBe("a");
  });
});
