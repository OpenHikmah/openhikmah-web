import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@xyflow/react", () => ({
  applyNodeChanges: vi.fn((changes: unknown[], nodes: unknown[]) => nodes),
  applyEdgeChanges: vi.fn((changes: unknown[], edges: unknown[]) => edges),
}));

import { useCanvasStore } from "@/store/canvas";
import type { Verse, CanvasEdge } from "@/types/quran";

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

  it("addVerseNode uses random position when none provided", () => {
    const id = useCanvasStore.getState().addVerseNode(baseVerse);
    const node = useCanvasStore.getState().getNodeById(id);
    expect(node).toBeDefined();
    expect(typeof node!.position.x).toBe("number");
    expect(typeof node!.position.y).toBe("number");
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
    const id2 = useCanvasStore.getState().addVerseNode(
      { ...baseVerse, ref: "1:1" as const, ayah: 1, surah: 1 },
      { x: 300, y: 0 }
    );
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
    const id2 = useCanvasStore.getState().addVerseNode(
      { ...baseVerse, ref: "1:1" as const, ayah: 1, surah: 1 },
      { x: 300, y: 0 }
    );
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
