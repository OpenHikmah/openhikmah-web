"use client";

import { create } from "zustand";
import type {
  Verse,
  CanvasEdge,
  SidebarContent,
  PendingExpand,
  EdgeKind,
} from "@/types/quran";
import type { Node, Edge, NodeChange, EdgeChange } from "@xyflow/react";
import { applyNodeChanges, applyEdgeChanges } from "@xyflow/react";
import { findFreeSlot } from "@/lib/canvas-layout";

// ─── Persistence helpers ───────────────────────────────────────────────────────

export interface SavedNode {
  id: string;
  x: number;
  y: number;
  verse: Verse;
}

export interface SavedEdge {
  id: string;
  source: string;
  target: string;
  kind: EdgeKind;
  label: string;
  reason: string;
}

export interface SavedCanvas {
  v: 1;
  nodes: SavedNode[];
  edges: SavedEdge[];
}

export function serializeCanvas(nodes: Node[], edges: Edge[]): SavedCanvas {
  return {
    v: 1,
    nodes: nodes.map((n) => ({
      id: n.id,
      x: n.position.x,
      y: n.position.y,
      verse: n.data as unknown as Verse,
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      kind: ((e.data as { kind?: EdgeKind })?.kind ?? "thematic") as EdgeKind,
      label: (e.data as { label?: string })?.label ?? "",
      reason: (e.data as { reason?: string })?.reason ?? "",
    })),
  };
}

export function deserializeCanvas(saved: SavedCanvas): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = saved.nodes.map((n) => ({
    id: n.id,
    type: "verse",
    position: { x: n.x, y: n.y },
    data: { ...n.verse } as unknown as Record<string, unknown>,
  }));
  const edges: Edge[] = saved.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: "hikmah",
    animated: true,
    data: { kind: e.kind, label: e.label, reason: e.reason },
  }));
  return { nodes, edges };
}

interface CanvasViewport {
  x: number;
  y: number;
  zoom: number;
}

interface CanvasStore {
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;
  expandingNodeId: string | null;
  openExpandNodeId: string | null;
  sidebarContent: SidebarContent | null;
  pendingExpand: PendingExpand | null;
  pendingAutoExpand: string | null;
  viewport: CanvasViewport;

  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  setViewport: (viewport: CanvasViewport) => void;

  addVerseNode: (verse: Verse, position?: { x: number; y: number }) => string;
  addConnectionEdge: (edge: CanvasEdge) => void;
  setSelectedNode: (id: string | null) => void;
  setExpandingNode: (id: string | null) => void;
  setOpenExpandNodeId: (id: string | null) => void;
  setSidebarContent: (content: SidebarContent | null) => void;
  setPendingExpand: (action: PendingExpand | null) => void;
  setPendingAutoExpand: (nodeId: string | null) => void;
  hasNode: (ref: string) => boolean;
  getNodeByRef: (ref: string) => Node | undefined;
  getNodeById: (id: string) => Node | undefined;
  reset: () => void;
  restoreCanvas: (saved: SavedCanvas) => void;
}

let nodeIdCounter = 0;
const nextId = () => `node-${++nodeIdCounter}`;

export const useCanvasStore = create<CanvasStore>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  expandingNodeId: null,
  openExpandNodeId: null,
  sidebarContent: null,
  pendingExpand: null,
  pendingAutoExpand: null,
  viewport: { x: 0, y: 0, zoom: 1 },

  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),

  onNodesChange: (changes) =>
    set((s) => ({ nodes: applyNodeChanges(changes, s.nodes) })),

  onEdgesChange: (changes) =>
    set((s) => ({ edges: applyEdgeChanges(changes, s.edges) })),

  setViewport: (viewport) => set({ viewport }),

  addVerseNode: (verse, position) => {
    const id = nextId();
    // When no explicit position is given, drop the node into the nearest empty
    // slot around the origin instead of a random point, so it never lands on an
    // existing node. Callers with a meaningful anchor (search, expansion) pass one.
    const pos =
      position ?? findFreeSlot(get().nodes.map((n) => n.position), { x: 0, y: 0 });
    set((s) => ({
      nodes: [
        ...s.nodes,
        { id, type: "verse", position: pos, data: { ...verse } } as Node,
      ],
    }));
    return id;
  },

  addConnectionEdge: (edge) => {
    set((s) => {
      const exists = s.edges.some(
        (e) =>
          (e.source === edge.source && e.target === edge.target) ||
          (e.source === edge.target && e.target === edge.source)
      );
      if (exists) return s;
      return {
        edges: [
          ...s.edges,
          {
            id: edge.id,
            source: edge.source,
            target: edge.target,
            type: "hikmah",
            data: edge.data,
            animated: true,
          } as Edge,
        ],
      };
    });
  },

  setSelectedNode: (id) => set({ selectedNodeId: id }),
  setExpandingNode: (id) => set({ expandingNodeId: id }),
  setOpenExpandNodeId: (id) => set({ openExpandNodeId: id }),
  setSidebarContent: (content) => set({ sidebarContent: content }),
  setPendingExpand: (action) => set({ pendingExpand: action }),
  setPendingAutoExpand: (nodeId) => set({ pendingAutoExpand: nodeId }),

  hasNode: (ref) =>
    get().nodes.some((n) => (n.data as unknown as Verse)?.ref === ref),

  getNodeByRef: (ref) =>
    get().nodes.find((n) => (n.data as unknown as Verse)?.ref === ref),

  getNodeById: (id) => get().nodes.find((n) => n.id === id),

  reset: () =>
    set({
      nodes: [],
      edges: [],
      selectedNodeId: null,
      expandingNodeId: null,
      openExpandNodeId: null,
      sidebarContent: null,
      pendingExpand: null,
      pendingAutoExpand: null,
    }),

  restoreCanvas: (saved: SavedCanvas) => {
    const { nodes, edges } = deserializeCanvas(saved);
    const maxNum = nodes.reduce((max, n) => {
      const m = n.id.match(/^node-(\d+)$/);
      return m ? Math.max(max, parseInt(m[1], 10)) : max;
    }, 0);
    nodeIdCounter = maxNum;
    set({
      nodes,
      edges,
      selectedNodeId: null,
      expandingNodeId: null,
      openExpandNodeId: null,
      sidebarContent: null,
      pendingExpand: null,
      pendingAutoExpand: null,
    });
  },
}));
