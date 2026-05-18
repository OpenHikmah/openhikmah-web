"use client";

import { create } from "zustand";
import type { Verse, CanvasEdge } from "@/types/quran";
import type { Node, Edge, NodeChange, EdgeChange } from "@xyflow/react";
import { applyNodeChanges, applyEdgeChanges } from "@xyflow/react";

interface CanvasStore {
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;
  expandingNodeId: string | null;

  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;

  addVerseNode: (verse: Verse, position?: { x: number; y: number }) => string;
  addConnectionEdge: (edge: CanvasEdge) => void;
  setSelectedNode: (id: string | null) => void;
  setExpandingNode: (id: string | null) => void;
  hasNode: (ref: string) => boolean;
  getNodeByRef: (ref: string) => Node | undefined;
  reset: () => void;
}

let nodeIdCounter = 0;
const nextId = () => `node-${++nodeIdCounter}`;

export const useCanvasStore = create<CanvasStore>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  expandingNodeId: null,

  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),

  onNodesChange: (changes) =>
    set((s) => ({ nodes: applyNodeChanges(changes, s.nodes) })),

  onEdgesChange: (changes) =>
    set((s) => ({ edges: applyEdgeChanges(changes, s.edges) })),

  addVerseNode: (verse, position) => {
    const id = nextId();
    const pos = position ?? {
      x: (Math.random() - 0.5) * 700,
      y: (Math.random() - 0.5) * 500,
    };
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

  hasNode: (ref) =>
    get().nodes.some((n) => (n.data as unknown as Verse)?.ref === ref),

  getNodeByRef: (ref) =>
    get().nodes.find((n) => (n.data as unknown as Verse)?.ref === ref),

  reset: () =>
    set({ nodes: [], edges: [], selectedNodeId: null, expandingNodeId: null }),
}));
