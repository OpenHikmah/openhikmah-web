import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@xyflow/react", () => ({
  applyNodeChanges: vi.fn((changes: unknown[], nodes: unknown[]) => nodes),
  applyEdgeChanges: vi.fn((changes: unknown[], edges: unknown[]) => edges),
}));

import { useCanvasStore, serializeCanvas, deserializeCanvas } from "@/store/canvas";
import type { Verse, CanvasEdge } from "@/types/quran";
import type { Node, Edge } from "@xyflow/react";

const baseVerse: Verse = {
  surah: 2,
  ayah: 255,
  ref: "2:255",
  arabicText: "اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ",
  translation: "Allah — there is no deity except Him.",
  surahName: "Al-Baqarah",
  surahNameArabic: "البقرة",
};

describe("canvas store", () => {
  beforeEach(() => {
    useCanvasStore.getState().reset();
  });

  it("initial state is empty", () => {
    const s = useCanvasStore.getState();
    expect(s.nodes).toHaveLength(0);
    expect(s.edges).toHaveLength(0);
    expect(s.selectedNodeId).toBeNull();
    expect(s.expandingNodeId).toBeNull();
    expect(s.sidebarContent).toBeNull();
    expect(s.pendingExpand).toBeNull();
    expect(s.pendingAutoExpand).toBeNull();
  });

  it("addVerseNode adds a node and returns a string id", () => {
    const id = useCanvasStore.getState().addVerseNode(baseVerse, { x: 0, y: 0 });
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
    expect(useCanvasStore.getState().nodes).toHaveLength(1);
  });

  it("addVerseNode stores verse data on the node", () => {
    const id = useCanvasStore.getState().addVerseNode(baseVerse, { x: 10, y: 20 });
    const node = useCanvasStore.getState().getNodeById(id);
    expect(node).toBeDefined();
    expect(node!.data).toMatchObject({ ref: "2:255", surah: 2 });
  });

  it("addVerseNode picks a collision-free position when none provided", () => {
    const id = useCanvasStore.getState().addVerseNode(baseVerse);
    const node = useCanvasStore.getState().getNodeById(id);
    expect(node).toBeDefined();
    expect(typeof node!.position.x).toBe("number");
    expect(typeof node!.position.y).toBe("number");

    // A second auto-placed node must not stack on the first.
    const id2 = useCanvasStore
      .getState()
      .addVerseNode({ ...baseVerse, ref: "1:1", surah: 1, ayah: 1 });
    const node2 = useCanvasStore.getState().getNodeById(id2);
    const dx = Math.abs(node!.position.x - node2!.position.x);
    const dy = Math.abs(node!.position.y - node2!.position.y);
    expect(dx >= 288 || dy >= 240).toBe(true);
  });

  it("hasNode returns true after addVerseNode", () => {
    useCanvasStore.getState().addVerseNode(baseVerse, { x: 0, y: 0 });
    expect(useCanvasStore.getState().hasNode("2:255")).toBe(true);
  });

  it("hasNode returns false for absent verse", () => {
    expect(useCanvasStore.getState().hasNode("1:1")).toBe(false);
  });

  it("getNodeByRef returns the correct node", () => {
    const id = useCanvasStore.getState().addVerseNode(baseVerse, { x: 0, y: 0 });
    const node = useCanvasStore.getState().getNodeByRef("2:255");
    expect(node).toBeDefined();
    expect(node!.id).toBe(id);
  });

  it("getNodeById returns correct node", () => {
    const id = useCanvasStore.getState().addVerseNode(baseVerse, { x: 0, y: 0 });
    const node = useCanvasStore.getState().getNodeById(id);
    expect(node!.id).toBe(id);
  });

  it("addConnectionEdge adds an edge", () => {
    const sourceId = useCanvasStore.getState().addVerseNode(baseVerse, { x: 0, y: 0 });
    const targetVerse = { ...baseVerse, surah: 1, ayah: 1, ref: "1:1" as const };
    const targetId = useCanvasStore.getState().addVerseNode(targetVerse, { x: 300, y: 0 });

    const edge: CanvasEdge = {
      id: "edge-1",
      source: sourceId,
      target: targetId,
      type: "hikmah",
      data: { kind: "thematic", label: "theme", reason: "test" },
    };
    useCanvasStore.getState().addConnectionEdge(edge);
    expect(useCanvasStore.getState().edges).toHaveLength(1);
  });

  it("addConnectionEdge does not add duplicate edges", () => {
    const id1 = useCanvasStore.getState().addVerseNode(baseVerse, { x: 0, y: 0 });
    const id2 = useCanvasStore
      .getState()
      .addVerseNode({ ...baseVerse, ref: "1:1" as const, ayah: 1, surah: 1 }, { x: 300, y: 0 });
    const edge: CanvasEdge = {
      id: "edge-1",
      source: id1,
      target: id2,
      type: "hikmah",
      data: { kind: "thematic", label: "theme" },
    };
    useCanvasStore.getState().addConnectionEdge(edge);
    useCanvasStore.getState().addConnectionEdge(edge);
    expect(useCanvasStore.getState().edges).toHaveLength(1);
  });

  it("addConnectionEdge prevents reversed duplicate", () => {
    const id1 = useCanvasStore.getState().addVerseNode(baseVerse, { x: 0, y: 0 });
    const id2 = useCanvasStore
      .getState()
      .addVerseNode({ ...baseVerse, ref: "1:1" as const, ayah: 1, surah: 1 }, { x: 300, y: 0 });
    const edge: CanvasEdge = {
      id: "edge-1",
      source: id1,
      target: id2,
      type: "hikmah",
      data: { kind: "root", label: "root" },
    };
    const reversed: CanvasEdge = { ...edge, id: "edge-2", source: id2, target: id1 };
    useCanvasStore.getState().addConnectionEdge(edge);
    useCanvasStore.getState().addConnectionEdge(reversed);
    expect(useCanvasStore.getState().edges).toHaveLength(1);
  });

  it("setSelectedNode sets selectedNodeId", () => {
    useCanvasStore.getState().setSelectedNode("node-1");
    expect(useCanvasStore.getState().selectedNodeId).toBe("node-1");
  });

  it("setExpandingNode sets expandingNodeId", () => {
    useCanvasStore.getState().setExpandingNode("node-2");
    expect(useCanvasStore.getState().expandingNodeId).toBe("node-2");
  });

  it("setSidebarContent stores sidebar content", () => {
    useCanvasStore.getState().setSidebarContent({ type: "node", verse: baseVerse });
    expect(useCanvasStore.getState().sidebarContent).toMatchObject({ type: "node" });
  });

  it("setPendingExpand stores pending expand action", () => {
    useCanvasStore.getState().setPendingExpand({ nodeId: "n1", ref: "2:255", kind: "thematic" });
    const pending = useCanvasStore.getState().pendingExpand;
    expect(pending?.nodeId).toBe("n1");
    expect(pending?.kind).toBe("thematic");
  });

  it("setPendingAutoExpand sets pendingAutoExpand", () => {
    useCanvasStore.getState().setPendingAutoExpand("node-10");
    expect(useCanvasStore.getState().pendingAutoExpand).toBe("node-10");
  });

  it("reset clears all state", () => {
    useCanvasStore.getState().addVerseNode(baseVerse, { x: 0, y: 0 });
    useCanvasStore.getState().setSelectedNode("x");
    useCanvasStore.getState().reset();
    const s = useCanvasStore.getState();
    expect(s.nodes).toHaveLength(0);
    expect(s.edges).toHaveLength(0);
    expect(s.selectedNodeId).toBeNull();
    expect(s.sidebarContent).toBeNull();
    expect(s.pendingExpand).toBeNull();
    expect(s.pendingAutoExpand).toBeNull();
  });
});

// ── serializeCanvas / deserializeCanvas ────────────────────────────────────────

describe("serializeCanvas", () => {
  const verse1: Verse = { ...baseVerse };

  it("produces v:1 format", () => {
    const saved = serializeCanvas([], []);
    expect(saved.v).toBe(1);
    expect(saved.nodes).toEqual([]);
    expect(saved.edges).toEqual([]);
  });

  it("serializes node position and verse data", () => {
    const node: Node = {
      id: "node-5",
      type: "verse",
      position: { x: 100, y: 200 },
      data: { ...verse1 } as unknown as Record<string, unknown>,
    };
    const saved = serializeCanvas([node], []);
    expect(saved.nodes).toHaveLength(1);
    expect(saved.nodes[0]).toMatchObject({
      id: "node-5",
      x: 100,
      y: 200,
    });
  });

  it("serializes edge kind, label, and reason", () => {
    const edge: Edge = {
      id: "edge-1",
      source: "node-1",
      target: "node-2",
      data: { kind: "thematic", label: "Tawakkul", reason: "Both speak of reliance." },
    };
    const saved = serializeCanvas([], [edge]);
    expect(saved.edges).toHaveLength(1);
    expect(saved.edges[0]).toMatchObject({
      id: "edge-1",
      source: "node-1",
      target: "node-2",
      kind: "thematic",
      label: "Tawakkul",
      reason: "Both speak of reliance.",
    });
  });

  it("defaults missing kind to 'thematic'", () => {
    const edge: Edge = {
      id: "edge-1",
      source: "node-1",
      target: "node-2",
      data: {},
    };
    const saved = serializeCanvas([], [edge]);
    expect(saved.edges[0].kind).toBe("thematic");
  });
});

describe("deserializeCanvas", () => {
  it("restores nodes with correct type and position", () => {
    const saved = {
      v: 1 as const,
      nodes: [{ id: "node-7", x: 50, y: 80, verse: baseVerse }],
      edges: [],
    };
    const { nodes } = deserializeCanvas(saved);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].id).toBe("node-7");
    expect(nodes[0].type).toBe("verse");
    expect(nodes[0].position).toEqual({ x: 50, y: 80 });
  });

  it("restores edges with correct type and animated flag", () => {
    const saved = {
      v: 1 as const,
      nodes: [],
      edges: [
        {
          id: "edge-3",
          source: "node-1",
          target: "node-2",
          kind: "root" as const,
          label: "root",
          reason: "shared root",
        },
      ],
    };
    const { edges } = deserializeCanvas(saved);
    expect(edges).toHaveLength(1);
    expect(edges[0].type).toBe("hikmah");
    expect(edges[0].animated).toBe(true);
    expect((edges[0].data as { kind: string }).kind).toBe("root");
  });

  it("round-trips through serialize → deserialize", () => {
    const store = useCanvasStore.getState();
    store.reset();
    const id1 = store.addVerseNode(baseVerse, { x: 10, y: 20 });
    const id2 = store.addVerseNode(
      {
        ...baseVerse,
        ref: "1:1" as const,
        surah: 1,
        ayah: 1,
        surahName: "Al-Fatihah",
        surahNameArabic: "الفاتحة",
      },
      { x: 300, y: 20 }
    );
    store.addConnectionEdge({
      id: "edge-rt",
      source: id1,
      target: id2,
      type: "hikmah",
      data: { kind: "thematic", label: "patience", reason: "both discuss sabr" },
    });

    const { nodes, edges } = useCanvasStore.getState();
    const saved = serializeCanvas(nodes, edges);
    const restored = deserializeCanvas(saved);

    expect(restored.nodes).toHaveLength(2);
    expect(restored.edges).toHaveLength(1);
    expect(restored.nodes[0].id).toBe(id1);
    expect(restored.nodes[1].id).toBe(id2);
    expect((restored.edges[0].data as { kind: string }).kind).toBe("thematic");
  });
});

describe("restoreCanvas", () => {
  it("loads saved state and clears UI state", () => {
    const store = useCanvasStore.getState();
    store.setSelectedNode("old-node");
    store.setSidebarContent({ type: "node", verse: baseVerse });

    store.restoreCanvas({
      v: 1,
      nodes: [{ id: "node-3", x: 0, y: 0, verse: baseVerse }],
      edges: [],
    });

    const s = useCanvasStore.getState();
    expect(s.nodes).toHaveLength(1);
    expect(s.edges).toHaveLength(0);
    expect(s.selectedNodeId).toBeNull();
    expect(s.sidebarContent).toBeNull();
    expect(s.pendingExpand).toBeNull();
  });

  it("restores node id counter so new nodes don't collide", () => {
    const store = useCanvasStore.getState();
    store.restoreCanvas({
      v: 1,
      nodes: [{ id: "node-10", x: 0, y: 0, verse: baseVerse }],
      edges: [],
    });

    const newId = store.addVerseNode(
      { ...baseVerse, ref: "3:18" as const, surah: 3, ayah: 18 },
      { x: 0, y: 0 }
    );
    // New node must have a numeric id greater than 10
    const num = parseInt(newId.replace("node-", ""), 10);
    expect(num).toBeGreaterThan(10);
  });
});
