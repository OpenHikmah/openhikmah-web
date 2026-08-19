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

  it('addConnectionEdge adds an edge and reports "added"', () => {
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
    const result = useCanvasStore.getState().addConnectionEdge(edge);
    expect(result).toBe("added");
    expect(useCanvasStore.getState().edges).toHaveLength(1);
  });

  it('addConnectionEdge does not add a duplicate of the same kind, and reports "duplicate-same-kind"', () => {
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
    const result = useCanvasStore.getState().addConnectionEdge(edge);
    expect(result).toBe("duplicate-same-kind");
    expect(useCanvasStore.getState().edges).toHaveLength(1);
  });

  it("addConnectionEdge prevents a reversed duplicate of the same kind", () => {
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
    const result = useCanvasStore.getState().addConnectionEdge(reversed);
    expect(result).toBe("duplicate-same-kind");
    expect(useCanvasStore.getState().edges).toHaveLength(1);
  });

  it('addConnectionEdge does not add a second edge of a different kind between the same pair, and reports "duplicate-different-kind"', () => {
    const id1 = useCanvasStore.getState().addVerseNode(baseVerse, { x: 0, y: 0 });
    const id2 = useCanvasStore
      .getState()
      .addVerseNode({ ...baseVerse, ref: "1:1" as const, ayah: 1, surah: 1 }, { x: 300, y: 0 });
    const thematicEdge: CanvasEdge = {
      id: "edge-1",
      source: id1,
      target: id2,
      type: "hikmah",
      data: { kind: "thematic", label: "theme" },
    };
    const rootEdge: CanvasEdge = {
      id: "edge-2",
      source: id1,
      target: id2,
      type: "hikmah",
      data: { kind: "root", label: "root" },
    };
    useCanvasStore.getState().addConnectionEdge(thematicEdge);
    const result = useCanvasStore.getState().addConnectionEdge(rootEdge);
    expect(result).toBe("duplicate-different-kind");
    expect(useCanvasStore.getState().edges).toHaveLength(1);
    expect((useCanvasStore.getState().edges[0].data as { kind?: string })?.kind).toBe("thematic");
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

  it("getExpansionRefs returns refs of same-kind children of a node", () => {
    const sourceId = useCanvasStore.getState().addVerseNode(baseVerse, { x: 0, y: 0 });
    const themeTarget = { ...baseVerse, ref: "1:1" as const, surah: 1, ayah: 1 };
    const rootTarget = { ...baseVerse, ref: "3:3" as const, surah: 3, ayah: 3 };
    const themeId = useCanvasStore.getState().addVerseNode(themeTarget, { x: 300, y: 0 });
    const rootId = useCanvasStore.getState().addVerseNode(rootTarget, { x: 600, y: 0 });

    useCanvasStore.getState().addConnectionEdge({
      id: "e1",
      source: sourceId,
      target: themeId,
      type: "hikmah",
      data: { kind: "thematic", label: "t" },
    });
    useCanvasStore.getState().addConnectionEdge({
      id: "e2",
      source: sourceId,
      target: rootId,
      type: "hikmah",
      data: { kind: "root", label: "r" },
    });

    expect(useCanvasStore.getState().getExpansionRefs(sourceId, "thematic")).toEqual(["1:1"]);
    expect(useCanvasStore.getState().getExpansionRefs(sourceId, "root")).toEqual(["3:3"]);
    expect(useCanvasStore.getState().getExpansionRefs(sourceId, "contrast")).toEqual([]);
  });

  it("getExpansionRefs is directed — a node's own incoming edges don't count", () => {
    const sourceId = useCanvasStore.getState().addVerseNode(baseVerse, { x: 0, y: 0 });
    const targetId = useCanvasStore
      .getState()
      .addVerseNode({ ...baseVerse, ref: "1:1" as const, surah: 1, ayah: 1 }, { x: 300, y: 0 });
    useCanvasStore.getState().addConnectionEdge({
      id: "e1",
      source: sourceId,
      target: targetId,
      type: "hikmah",
      data: { kind: "thematic", label: "t" },
    });

    expect(useCanvasStore.getState().getExpansionRefs(targetId, "thematic")).toEqual([]);
  });

  it("getExpansionCounts groups edges by kind for a given source node", () => {
    const sourceId = useCanvasStore.getState().addVerseNode(baseVerse, { x: 0, y: 0 });
    const a = useCanvasStore
      .getState()
      .addVerseNode({ ...baseVerse, ref: "1:1" as const, surah: 1, ayah: 1 }, { x: 300, y: 0 });
    const b = useCanvasStore
      .getState()
      .addVerseNode({ ...baseVerse, ref: "3:3" as const, surah: 3, ayah: 3 }, { x: 600, y: 0 });

    useCanvasStore.getState().addConnectionEdge({
      id: "e1",
      source: sourceId,
      target: a,
      type: "hikmah",
      data: { kind: "thematic", label: "t" },
    });
    useCanvasStore.getState().addConnectionEdge({
      id: "e2",
      source: sourceId,
      target: b,
      type: "hikmah",
      data: { kind: "thematic", label: "t" },
    });

    expect(useCanvasStore.getState().getExpansionCounts(sourceId)).toEqual({ thematic: 2 });
  });

  it("getExpansionCounts returns an empty object for a node with no expansions", () => {
    const id = useCanvasStore.getState().addVerseNode(baseVerse, { x: 0, y: 0 });
    expect(useCanvasStore.getState().getExpansionCounts(id)).toEqual({});
  });

  it("getExpansionCounts updates immediately after addConnectionEdge, without a re-scan call", () => {
    const sourceId = useCanvasStore.getState().addVerseNode(baseVerse, { x: 0, y: 0 });
    const targetId = useCanvasStore
      .getState()
      .addVerseNode({ ...baseVerse, ref: "1:1" as const, surah: 1, ayah: 1 }, { x: 300, y: 0 });

    expect(useCanvasStore.getState().getExpansionCounts(sourceId)).toEqual({});

    useCanvasStore.getState().addConnectionEdge({
      id: "e1",
      source: sourceId,
      target: targetId,
      type: "hikmah",
      data: { kind: "root", label: "t" },
    });

    expect(useCanvasStore.getState().getExpansionCounts(sourceId)).toEqual({ root: 1 });
  });

  it("getDuplicateNodeIds returns every node id sharing a ref", () => {
    const id1 = useCanvasStore.getState().addVerseNode(baseVerse, { x: 0, y: 0 });
    const id2 = useCanvasStore.getState().addVerseNode(baseVerse, { x: 300, y: 0 });
    const other = useCanvasStore
      .getState()
      .addVerseNode({ ...baseVerse, ref: "1:1" as const, surah: 1, ayah: 1 }, { x: 600, y: 0 });

    expect(useCanvasStore.getState().getDuplicateNodeIds("2:255").sort()).toEqual(
      [id1, id2].sort()
    );
    expect(useCanvasStore.getState().getDuplicateNodeIds("1:1")).toEqual([other]);
  });

  it("getDuplicateNodeIds returns an empty array for a ref not on the canvas", () => {
    expect(useCanvasStore.getState().getDuplicateNodeIds("9:9")).toEqual([]);
  });

  it("getDuplicateNodeIds and getExpansionCounts return copies, not the cached map's live values", () => {
    const id1 = useCanvasStore.getState().addVerseNode(baseVerse, { x: 0, y: 0 });
    const id2 = useCanvasStore.getState().addVerseNode(baseVerse, { x: 300, y: 0 });

    const dupes = useCanvasStore.getState().getDuplicateNodeIds("2:255");
    dupes.push("mutated-in-caller");
    expect(useCanvasStore.getState().getDuplicateNodeIds("2:255")).toEqual([id1, id2]);

    const edge: CanvasEdge = {
      id: "edge-1",
      source: id1,
      target: id2,
      type: "hikmah",
      data: { kind: "thematic", label: "theme" },
    };
    useCanvasStore.getState().addConnectionEdge(edge);
    const counts = useCanvasStore.getState().getExpansionCounts(id1);
    counts.thematic = 999;
    expect(useCanvasStore.getState().getExpansionCounts(id1)).toEqual({ thematic: 1 });
  });

  it("duplicate and expansion-count lookups stay correct after the newly-added pulse clears, proving they don't rely on newlyAddedNodeId as a freshness signal", () => {
    const id1 = useCanvasStore.getState().addVerseNode(baseVerse, { x: 0, y: 0 });
    const id2 = useCanvasStore.getState().addVerseNode(baseVerse, { x: 300, y: 0 });
    useCanvasStore.getState().addConnectionEdge({
      id: "e1",
      source: id1,
      target: id2,
      type: "hikmah",
      data: { kind: "contrast", label: "t" },
    });

    // Simulate the pulse-highlight timeout having already fired and cleared
    // newlyAddedNodeId — the derived lookups must still reflect current state.
    useCanvasStore.setState({ newlyAddedNodeId: null });

    expect(useCanvasStore.getState().getDuplicateNodeIds("2:255").sort()).toEqual(
      [id1, id2].sort()
    );
    expect(useCanvasStore.getState().getExpansionCounts(id1)).toEqual({ contrast: 1 });
  });

  it("reset clears all state, including the derived duplicate/expansion-count maps", () => {
    const id = useCanvasStore.getState().addVerseNode(baseVerse, { x: 0, y: 0 });
    useCanvasStore.getState().setSelectedNode("x");
    useCanvasStore.getState().reset();
    const s = useCanvasStore.getState();
    expect(s.nodes).toHaveLength(0);
    expect(s.edges).toHaveLength(0);
    expect(s.selectedNodeId).toBeNull();
    expect(s.sidebarContent).toBeNull();
    expect(s.pendingExpand).toBeNull();
    expect(s.pendingAutoExpand).toBeNull();
    expect(s.duplicateNodeIdsByRef).toEqual({});
    expect(s.expansionCountsByNode).toEqual({});
    expect(s.getDuplicateNodeIds("2:255")).toEqual([]);
    expect(s.getExpansionCounts(id)).toEqual({});
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

  it("populates the derived duplicate/expansion-count maps from restored data", () => {
    const store = useCanvasStore.getState();
    store.restoreCanvas({
      v: 1,
      nodes: [
        { id: "node-1", x: 0, y: 0, verse: baseVerse },
        { id: "node-2", x: 300, y: 0, verse: baseVerse },
      ],
      edges: [
        { id: "e1", source: "node-1", target: "node-2", kind: "thematic", label: "", reason: "" },
      ],
    });

    const s = useCanvasStore.getState();
    expect(s.getDuplicateNodeIds("2:255").sort()).toEqual(["node-1", "node-2"]);
    expect(s.getExpansionCounts("node-1")).toEqual({ thematic: 1 });
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

describe("appendWorkspace", () => {
  beforeEach(() => {
    useCanvasStore.getState().reset();
  });

  it("merges a duplicate verse and a remapped expansion edge, updating both derived-index maps", () => {
    const store = useCanvasStore.getState();
    const existingId = store.addVerseNode(baseVerse, { x: 0, y: 0 });

    store.appendWorkspace({
      v: 1,
      nodes: [
        // Same id as the already-on-canvas node -> forces a remap; same ref -> duplicate.
        { id: existingId, x: 300, y: 0, verse: baseVerse },
        {
          id: "incoming-2",
          x: 600,
          y: 0,
          verse: { ...baseVerse, ref: "1:1" as const, surah: 1, ayah: 1 },
        },
      ],
      edges: [
        {
          id: "e1",
          source: existingId,
          target: "incoming-2",
          kind: "thematic",
          label: "",
          reason: "",
        },
      ],
    });

    const s = useCanvasStore.getState();
    expect(s.nodes).toHaveLength(3);

    const dupes = s.getDuplicateNodeIds(baseVerse.ref);
    expect(dupes).toHaveLength(2);
    expect(dupes).toContain(existingId);
    const remappedId = dupes.find((did) => did !== existingId)!;
    expect(remappedId).not.toBe(existingId);

    // The edge's source pointed at the pre-remap id, so the count must land on the
    // remapped node, not the original — proving expansionCountsByNode was rebuilt
    // from the remapped edges, not the incoming ones.
    expect(s.getExpansionCounts(remappedId)).toEqual({ thematic: 1 });
    expect(s.getExpansionCounts(existingId)).toEqual({});
  });

  it("regenerates edge ids on node-id remap, so a merged canvas never has two edges sharing an id (issue #474)", () => {
    // Two canvases that both numbered nodes from scratch: both have an edge
    // literally named "edge-node-1-node-2". Appending one into the other forces
    // a node-id remap; the incoming edge's id must be regenerated from the new
    // source/target, not carried forward, or it collides with the existing edge.
    useCanvasStore.setState({
      nodes: [
        { id: "node-1", type: "verse", position: { x: 0, y: 0 }, data: { ...baseVerse } } as Node,
        {
          id: "node-2",
          type: "verse",
          position: { x: 300, y: 0 },
          data: { ...baseVerse, ref: "1:1" as const, surah: 1, ayah: 1 },
        } as Node,
      ],
      edges: [
        {
          id: "edge-node-1-node-2",
          source: "node-1",
          target: "node-2",
          type: "hikmah",
          data: { kind: "thematic", label: "", reason: "" },
        } as Edge,
      ],
    });

    useCanvasStore.getState().appendWorkspace({
      v: 1,
      nodes: [
        {
          id: "node-1",
          x: 600,
          y: 0,
          verse: { ...baseVerse, ref: "112:1" as const, surah: 112, ayah: 1 },
        },
        {
          id: "node-2",
          x: 900,
          y: 0,
          verse: { ...baseVerse, ref: "3:18" as const, surah: 3, ayah: 18 },
        },
      ],
      edges: [
        {
          id: "edge-node-1-node-2",
          source: "node-1",
          target: "node-2",
          kind: "root",
          label: "",
          reason: "",
        },
      ],
    });

    const s = useCanvasStore.getState();
    expect(s.edges).toHaveLength(2);
    const ids = s.edges.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);

    const incomingEdge = s.edges.find((e) => (e.data as { kind?: string })?.kind === "root")!;
    expect(incomingEdge.id).not.toBe("edge-node-1-node-2");
    expect(incomingEdge.id).toBe(`edge-${incomingEdge.source}-${incomingEdge.target}`);
  });
});
