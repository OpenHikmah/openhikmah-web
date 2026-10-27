"use client";

import { create } from "zustand";
import type { Verse, CanvasEdge, SidebarContent, PendingExpand, EdgeKind } from "@/types/quran";
import type { Node, Edge, NodeChange, EdgeChange } from "@xyflow/react";
import { applyNodeChanges, applyEdgeChanges } from "@xyflow/react";
import {
  findFreeSlot,
  placeColumnGroup,
  relayoutCanvas,
  NODE_HEIGHT,
  NODE_GAP,
  PLACEHOLDER_HEIGHT,
  type LayoutBox,
} from "@/lib/canvas/canvas-layout";
import { parseSavedCanvas, type SavedCanvas } from "@/lib/canvas/saved-canvas";

// ─── Persistence helpers ───────────────────────────────────────────────────────

export const PLACEHOLDER_NODE_TYPE = "placeholder";

export const isPlaceholderNode = (n: Node) => n.type === PLACEHOLDER_NODE_TYPE;
export const isPlaceholderEdge = (e: Edge) => !!(e.data as { placeholder?: boolean })?.placeholder;

export function serializeCanvas(nodes: Node[], edges: Edge[]): SavedCanvas {
  return {
    v: 1,
    nodes: nodes
      .filter((n) => !isPlaceholderNode(n))
      .map((n) => ({
        id: n.id,
        x: n.position.x,
        y: n.position.y,
        verse: n.data as unknown as Verse,
      })),
    edges: edges
      .filter((e) => !isPlaceholderEdge(e))
      .map((e) => ({
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
    data: { kind: e.kind, label: e.label, reason: e.reason },
  }));
  return { nodes, edges };
}

/** Which cards and lines the canvas highlights. Every other card and line fades. */
export interface CanvasFocus {
  nodes: Set<string>;
  edges: Set<string>;
  /** The card the reading panel shows (gold border). */
  selected: string | null;
  /** The two cards of the connection the reading panel shows. */
  paired: Set<string>;
}

export interface ExpansionFocus {
  sourceId: string;
  nodeIds: string[];
}

let focusCache: {
  sidebar: SidebarContent | null;
  expansion: ExpansionFocus | null;
  edges: Edge[];
  focus: CanvasFocus | null;
} | null = null;

/** Derived focus, memoised on its inputs so per-card selectors stay cheap. */
export function selectFocus(s: {
  sidebarContent: SidebarContent | null;
  expansionFocus: ExpansionFocus | null;
  edges: Edge[];
}): CanvasFocus | null {
  if (
    focusCache &&
    focusCache.sidebar === s.sidebarContent &&
    focusCache.expansion === s.expansionFocus &&
    focusCache.edges === s.edges
  ) {
    return focusCache.focus;
  }
  let focus: CanvasFocus | null = null;
  const x = s.expansionFocus;
  if (x) {
    const nodes = new Set([x.sourceId, ...x.nodeIds]);
    const edges = s.edges
      .filter(
        (e) =>
          (e.source === x.sourceId && nodes.has(e.target)) ||
          (e.target === x.sourceId && nodes.has(e.source))
      )
      .map((e) => e.id);
    focus = { nodes, edges: new Set(edges), selected: x.sourceId, paired: new Set() };
  } else if (s.sidebarContent?.type === "node") {
    const id = s.sidebarContent.nodeId;
    const own = s.edges.filter(
      (e) => !isPlaceholderEdge(e) && (e.source === id || e.target === id)
    );
    const nodes = new Set([id]);
    own.forEach((e) => {
      nodes.add(e.source);
      nodes.add(e.target);
    });
    focus = { nodes, edges: new Set(own.map((e) => e.id)), selected: id, paired: new Set() };
  } else if (s.sidebarContent?.type === "edge") {
    const edgeId = s.sidebarContent.edgeId;
    const edge = s.edges.find((e) => e.id === edgeId);
    if (edge) {
      const pair = new Set([edge.source, edge.target]);
      focus = { nodes: pair, edges: new Set([edge.id]), selected: null, paired: pair };
    }
  }
  focusCache = { sidebar: s.sidebarContent, expansion: s.expansionFocus, edges: s.edges, focus };
  return focus;
}

/** Connections of a card, in the order they were added, without placeholders. */
export function connectionsOf(edges: Edge[], nodeId: string): Edge[] {
  return edges.filter((e) => !isPlaceholderEdge(e) && (e.source === nodeId || e.target === nodeId));
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
  /** Kind of the expansion running on `expandingNodeId`. */
  expandingKind: EdgeKind | null;
  /** Line the reading panel's pointer is over, so the canvas can highlight it. */
  hoveredEdgeId: string | null;
  openExpandNodeId: string | null;
  sidebarContent: SidebarContent | null;
  /** What the reading panel showed last, so it can keep its content while it closes. */
  lastSidebarContent: SidebarContent | null;
  pendingExpand: PendingExpand | null;
  pendingAutoExpand: string | null;
  pendingPanToNodeId: string | null;
  newlyAddedNodeId: string | null;
  viewport: CanvasViewport;
  sidebarWidth: number;
  fitRequestToken: number;
  /** Bumped by restoreCanvas so consumers (the activity tracker) can tell a
   *  bulk restore apart from a genuine one-at-a-time user addition, without
   *  relying on effect-ordering/timing to distinguish the two. */
  restoreToken: number;
  /** Node ids sharing the same verse ref, keyed by ref. Recomputed by every
   *  action that touches `nodes`, so `getDuplicateNodeIds` is a plain lookup
   *  instead of an O(N) scan on every VerseNode render. */
  duplicateNodeIdsByRef: Record<string, string[]>;
  /** Per-source-node outgoing expansion-edge counts by kind. Recomputed by
   *  every action that touches `edges`, mirroring `duplicateNodeIdsByRef`. */
  expansionCountsByNode: Record<string, Partial<Record<EdgeKind, number>>>;
  /** Highlights a running (or just finished) expansion: its source and new cards. */
  expansionFocus: ExpansionFocus | null;
  /** The canvas as it was before the last Clear, kept so Clear can be undone. */
  clearedSnapshot: { nodes: Node[]; edges: Edge[] } | null;
  /** Bumped when a layout re-run moves cards, so the canvas can animate the move. */
  layoutToken: number;

  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  setViewport: (viewport: CanvasViewport) => void;

  addVerseNode: (verse: Verse, position?: { x: number; y: number }) => string;
  addSurahNodes: (verses: Verse[]) => string[];
  addConnectionEdge: (edge: CanvasEdge) => AddConnectionEdgeResult;
  setSelectedNode: (id: string | null) => void;
  setExpandingNode: (id: string | null, kind?: EdgeKind) => void;
  setHoveredEdge: (id: string | null) => void;
  setOpenExpandNodeId: (id: string | null) => void;
  setSidebarContent: (content: SidebarContent | null) => void;
  setPendingExpand: (action: PendingExpand | null) => void;
  setPendingAutoExpand: (nodeId: string | null) => void;
  setPendingPanToNode: (nodeId: string | null) => void;
  setNewlyAddedNode: (nodeId: string | null) => void;
  setSidebarWidth: (width: number) => void;
  /** Bumps `fitRequestToken` — components that render the ReactFlow instance (which
   * may live outside the caller's tree, e.g. the mobile bar in Header) watch this
   * to trigger `fitView()` without needing direct access to the ReactFlow instance. */
  requestFit: () => void;
  hasNode: (ref: string) => boolean;
  getNodeByRef: (ref: string) => Node | undefined;
  getNodeById: (id: string) => Node | undefined;
  getDuplicateNodeIds: (ref: string) => string[];
  getExpansionRefs: (nodeId: string, kind: EdgeKind) => string[];
  getExpansionCounts: (nodeId: string) => Partial<Record<EdgeKind, number>>;
  reset: () => void;
  restoreCanvas: (saved: unknown) => void;
  appendWorkspace: (saved: unknown) => void;

  setExpansionFocus: (focus: ExpansionFocus | null) => void;
  /** Adds `count` placeholder cards (and lines) in a column beside `sourceId`. */
  addPlaceholders: (
    sourceId: string,
    kind: EdgeKind,
    count: number,
    fallbackHeight: number
  ) => string[];
  /** Turns a placeholder into a verse card in the same place. Returns the new card id. */
  fillPlaceholder: (placeholderId: string, verse: Verse, sourceId: string) => string;
  removePlaceholders: (ids: string[]) => void;
  /** Re-places one new group beside its source with current card heights. */
  settleGroup: (sourceId: string, ids: string[], fallbackHeight: number) => void;
  /** Re-runs the column layout for every card an expansion added. */
  relayout: (fallbackHeight: number) => void;
  /** Forgets every hand move, then re-runs the layout. */
  resetLayout: (fallbackHeight: number) => void;
  /** Empties the canvas, keeping a snapshot for `undoClear`. */
  clearCanvas: () => void;
  undoClear: () => void;
  dismissClearUndo: () => void;
}

let nodeIdCounter = 0;
const nextId = () => `node-${++nodeIdCounter}`;

function computeDuplicateMap(nodes: Node[]): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const n of nodes) {
    const ref = (n.data as unknown as Verse)?.ref;
    if (!ref) continue;
    (map[ref] ??= []).push(n.id);
  }
  return map;
}

function computeExpansionCountsMap(
  edges: Edge[]
): Record<string, Partial<Record<EdgeKind, number>>> {
  const map: Record<string, Partial<Record<EdgeKind, number>>> = {};
  for (const e of edges) {
    const kind = (e.data as { kind?: EdgeKind })?.kind;
    if (!kind || isPlaceholderEdge(e)) continue;
    const counts = (map[e.source] ??= {});
    counts[kind] = (counts[kind] ?? 0) + 1;
  }
  return map;
}

export type AddConnectionEdgeResult =
  "added" | "duplicate-same-kind" | "duplicate-different-kind" | "missing-endpoint";

export const DEFAULT_SIDEBAR_WIDTH = 400;

let placeholderCounter = 0;

function nodeHeight(n: Node, fallbackHeight: number): number {
  if (n.measured?.height) return n.measured.height;
  return isPlaceholderNode(n) ? PLACEHOLDER_HEIGHT : fallbackHeight;
}

function layoutBox(n: Node, fallbackHeight: number): LayoutBox {
  return { x: n.position.x, y: n.position.y, h: nodeHeight(n, fallbackHeight) };
}

function relayoutNodes(nodes: Node[], fallbackHeight: number): Node[] {
  const positions = relayoutCanvas(
    nodes.map((n) => {
      const data = n.data as unknown as Verse;
      return {
        id: n.id,
        ...layoutBox(n, fallbackHeight),
        placedFrom: data.placedFrom,
        pinned: data.pinned,
      };
    })
  );
  return nodes.map((n) => {
    const p = positions.get(n.id);
    return p && (p.x !== n.position.x || p.y !== n.position.y) ? { ...n, position: p } : n;
  });
}

// Pulse duration must exceed the CSS `.node-pulse` animation length (1.5s) so the
// highlight class isn't stripped mid-animation.
const NEWLY_ADDED_PULSE_MS = 1600;
let newlyAddedTimeout: ReturnType<typeof setTimeout> | null = null;

export const useCanvasStore = create<CanvasStore>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  expandingNodeId: null,
  expandingKind: null,
  hoveredEdgeId: null,
  openExpandNodeId: null,
  sidebarContent: null,
  lastSidebarContent: null,
  pendingExpand: null,
  pendingAutoExpand: null,
  pendingPanToNodeId: null,
  newlyAddedNodeId: null,
  viewport: { x: 0, y: 0, zoom: 1 },
  sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
  fitRequestToken: 0,
  restoreToken: 0,
  duplicateNodeIdsByRef: {},
  expansionCountsByNode: {},
  expansionFocus: null,
  clearedSnapshot: null,
  layoutToken: 0,

  setNodes: (nodes) => set({ nodes, duplicateNodeIdsByRef: computeDuplicateMap(nodes) }),
  setEdges: (edges) => set({ edges, expansionCountsByNode: computeExpansionCountsMap(edges) }),

  onNodesChange: (changes) =>
    set((s) => {
      // A card the user drags keeps its spot through later layout re-runs.
      const dragged = new Set(
        changes.flatMap((c) => (c.type === "position" && c.dragging ? [c.id] : []))
      );
      const nodes = applyNodeChanges(changes, s.nodes).map((n) =>
        dragged.has(n.id) && !isPlaceholderNode(n) && !(n.data as unknown as Verse).pinned
          ? { ...n, data: { ...n.data, pinned: true } }
          : n
      );
      return { nodes, duplicateNodeIdsByRef: computeDuplicateMap(nodes) };
    }),

  onEdgesChange: (changes) =>
    set((s) => {
      const edges = applyEdgeChanges(changes, s.edges);
      return { edges, expansionCountsByNode: computeExpansionCountsMap(edges) };
    }),

  setViewport: (viewport) => set({ viewport }),

  addVerseNode: (verse, position) => {
    const id = nextId();
    // When no explicit position is given, drop the node into the nearest empty
    // slot around the origin instead of a random point, so it never lands on an
    // existing node. Callers with a meaningful anchor (search, expansion) pass one.
    const pos =
      position ??
      findFreeSlot(
        get().nodes.map((n) => n.position),
        { x: 0, y: 0 }
      );
    set((s) => {
      const nodes = [...s.nodes, { id, type: "verse", position: pos, data: { ...verse } } as Node];
      return { nodes, duplicateNodeIdsByRef: computeDuplicateMap(nodes), clearedSnapshot: null };
    });
    get().setNewlyAddedNode(id);
    return id;
  },

  // Lays every ayah of a surah into a single top-to-bottom column, one
  // `set()` call so the whole surah appears in one render. No edges between
  // them — EdgeKind ("thematic"/"root"/"contrast") has no "next ayah" kind,
  // and auto-triggering AI expansion per node (pendingAutoExpand) would fire
  // one AI call per ayah, which nobody asked for here.
  addSurahNodes: (verses) => {
    if (verses.length === 0) return [];
    const ids: string[] = [];
    set((s) => {
      const positions = [...s.nodes.map((n) => n.position)];
      const newNodes: Node[] = verses.map((verse, i) => {
        const id = nextId();
        ids.push(id);
        const anchor = { x: 0, y: i * (NODE_HEIGHT + NODE_GAP) };
        const pos = findFreeSlot(positions, anchor);
        positions.push(pos);
        return {
          id,
          type: "verse",
          position: pos,
          data: { ...verse, isRoot: i === 0 },
        } as Node;
      });
      const nodes = [...s.nodes, ...newNodes];
      return { nodes, duplicateNodeIdsByRef: computeDuplicateMap(nodes) };
    });
    if (ids[0]) get().setNewlyAddedNode(ids[0]);
    return ids;
  },

  addConnectionEdge: (edge) => {
    let result: AddConnectionEdgeResult = "added";
    set((s) => {
      // An in-flight expansion can outlive its source (Clear) — never persist an
      // edge that points at a node that no longer exists.
      if (
        !s.nodes.some((n) => n.id === edge.source) ||
        !s.nodes.some((n) => n.id === edge.target)
      ) {
        result = "missing-endpoint";
        return s;
      }
      const existingEdge = s.edges.find(
        (e) =>
          (e.source === edge.source && e.target === edge.target) ||
          (e.source === edge.target && e.target === edge.source)
      );
      if (existingEdge) {
        const existingKind = (existingEdge.data as { kind?: EdgeKind })?.kind;
        result =
          existingKind === edge.data.kind ? "duplicate-same-kind" : "duplicate-different-kind";
        return s;
      }
      const edges = [
        ...s.edges,
        {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          type: "hikmah",
          data: edge.data,
        } as Edge,
      ];
      return { edges, expansionCountsByNode: computeExpansionCountsMap(edges) };
    });
    return result;
  },

  setSelectedNode: (id) => set({ selectedNodeId: id }),
  setExpandingNode: (id, kind) =>
    set({ expandingNodeId: id, expandingKind: id ? (kind ?? null) : null }),
  setHoveredEdge: (id) => set({ hoveredEdgeId: id }),
  setOpenExpandNodeId: (id) => set({ openExpandNodeId: id }),
  // Opening the reading panel ends any expansion highlight: the panel's focus wins.
  setSidebarContent: (content) =>
    set((s) => ({
      sidebarContent: content,
      lastSidebarContent: content ?? s.lastSidebarContent,
      expansionFocus: content ? null : s.expansionFocus,
    })),
  setPendingExpand: (action) => set({ pendingExpand: action }),
  setPendingAutoExpand: (nodeId) => set({ pendingAutoExpand: nodeId }),
  setPendingPanToNode: (nodeId) => set({ pendingPanToNodeId: nodeId }),
  setSidebarWidth: (width) => set({ sidebarWidth: width }),
  requestFit: () => set((s) => ({ fitRequestToken: s.fitRequestToken + 1 })),

  setNewlyAddedNode: (nodeId) => {
    if (newlyAddedTimeout) clearTimeout(newlyAddedTimeout);
    set({ newlyAddedNodeId: nodeId });
    if (nodeId) {
      newlyAddedTimeout = setTimeout(() => {
        set((s) => (s.newlyAddedNodeId === nodeId ? { newlyAddedNodeId: null } : {}));
      }, NEWLY_ADDED_PULSE_MS);
    }
  },

  hasNode: (ref) => get().nodes.some((n) => (n.data as unknown as Verse)?.ref === ref),

  getNodeByRef: (ref) => get().nodes.find((n) => (n.data as unknown as Verse)?.ref === ref),

  getNodeById: (id) => get().nodes.find((n) => n.id === id),

  // Shallow copies — callers must not be able to mutate the cached maps directly.
  getDuplicateNodeIds: (ref) => [...(get().duplicateNodeIdsByRef[ref] ?? [])],

  // Expansion edges are always directed source(nodeId) -> target(newNode), so a
  // simple source+kind filter is sufficient — no need to check the reverse edge.
  getExpansionRefs: (nodeId, kind) => {
    const { edges, getNodeById } = get();
    return edges
      .filter((e) => e.source === nodeId && (e.data as { kind?: EdgeKind })?.kind === kind)
      .map((e) => (getNodeById(e.target)?.data as unknown as Verse)?.ref)
      .filter((ref) => !!ref) as string[];
  },

  getExpansionCounts: (nodeId) => ({ ...(get().expansionCountsByNode[nodeId] ?? {}) }),

  reset: () =>
    set({
      nodes: [],
      edges: [],
      selectedNodeId: null,
      expandingNodeId: null,
      openExpandNodeId: null,
      sidebarContent: null,
      lastSidebarContent: null,
      pendingExpand: null,
      pendingAutoExpand: null,
      pendingPanToNodeId: null,
      newlyAddedNodeId: null,
      duplicateNodeIdsByRef: {},
      expansionCountsByNode: {},
      expansionFocus: null,
      clearedSnapshot: null,
    }),

  restoreCanvas: (saved: unknown) => {
    const parsed = parseSavedCanvas(saved);
    if (!parsed) return;
    const { nodes, edges } = deserializeCanvas(parsed);
    const maxNum = nodes.reduce((max, n) => {
      const m = n.id.match(/^node-(\d+)$/);
      return m ? Math.max(max, parseInt(m[1], 10)) : max;
    }, 0);
    nodeIdCounter = maxNum;
    set((s) => ({
      nodes,
      edges,
      selectedNodeId: null,
      expandingNodeId: null,
      openExpandNodeId: null,
      sidebarContent: null,
      lastSidebarContent: null,
      pendingExpand: null,
      pendingAutoExpand: null,
      pendingPanToNodeId: null,
      newlyAddedNodeId: null,
      duplicateNodeIdsByRef: computeDuplicateMap(nodes),
      expansionCountsByNode: computeExpansionCountsMap(edges),
      expansionFocus: null,
      clearedSnapshot: null,
      restoreToken: s.restoreToken + 1,
    }));
  },

  appendWorkspace: (saved: unknown) => {
    const parsed = parseSavedCanvas(saved);
    if (!parsed) return;
    const { nodes: incoming, edges: incomingEdges } = deserializeCanvas(parsed);

    const maxNum = incoming.reduce((max, n) => {
      const m = n.id.match(/^node-(\d+)$/);
      return m ? Math.max(max, parseInt(m[1], 10)) : max;
    }, 0);
    if (maxNum > nodeIdCounter) nodeIdCounter = maxNum;

    const existing = get().nodes;
    const existingIds = new Set(existing.map((n) => n.id));
    const placed: Node[] = [];
    const idRemap = new Map<string, string>();

    for (const node of incoming) {
      const allPositions = [...existing.map((n) => n.position), ...placed.map((n) => n.position)];
      const pos = findFreeSlot(allPositions, node.position);
      let id = node.id;
      if (existingIds.has(id)) {
        id = nextId();
        idRemap.set(node.id, id);
      }
      placed.push({ ...node, id, position: pos });
    }
    // A child card names its source by id, so follow the source's new id.
    for (let i = 0; i < placed.length; i++) {
      const from = (placed[i].data as unknown as Verse).placedFrom;
      const remapped = from ? idRemap.get(from) : undefined;
      if (remapped) placed[i] = { ...placed[i], data: { ...placed[i].data, placedFrom: remapped } };
    }

    const finalEdges = incomingEdges
      .map((e) => {
        const source = idRemap.get(e.source) ?? e.source;
        const target = idRemap.get(e.target) ?? e.target;
        // Edge ids are derived from source/target (see buildConnectionEdge in
        // lib/canvas/canvas-layout.ts) — regenerate on remap, or a remapped edge
        // can collide with an unrelated edge of the same original id/formula
        // already present in the destination canvas.
        return { ...e, id: `edge-${source}-${target}`, source, target };
      })
      .filter(
        (e) =>
          !get().edges.some(
            (ex) =>
              (ex.source === e.source && ex.target === e.target) ||
              (ex.source === e.target && ex.target === e.source)
          )
      );

    set((s) => {
      const nodes = [...s.nodes, ...placed];
      const edges = [...s.edges, ...finalEdges];
      return {
        nodes,
        edges,
        duplicateNodeIdsByRef: computeDuplicateMap(nodes),
        expansionCountsByNode: computeExpansionCountsMap(edges),
        restoreToken: s.restoreToken + 1,
      };
    });
  },

  setExpansionFocus: (focus) => set({ expansionFocus: focus }),

  addPlaceholders: (sourceId, kind, count, fallbackHeight) => {
    const source = get().getNodeById(sourceId);
    if (!source || count <= 0) return [];
    const ids = Array.from({ length: count }, () => `placeholder-${++placeholderCounter}`);
    set((s) => {
      const positions = placeColumnGroup(
        layoutBox(source, fallbackHeight),
        ids.map(() => PLACEHOLDER_HEIGHT),
        s.nodes.filter((n) => n.id !== sourceId).map((n) => layoutBox(n, fallbackHeight))
      );
      const nodes = [
        ...s.nodes,
        ...ids.map(
          (id, i) =>
            ({
              id,
              type: PLACEHOLDER_NODE_TYPE,
              position: positions[i],
              data: { kind },
              draggable: false,
              selectable: false,
            }) as Node
        ),
      ];
      const edges = [
        ...s.edges,
        ...ids.map(
          (id) =>
            ({
              id: `edge-${sourceId}-${id}`,
              source: sourceId,
              target: id,
              type: "hikmah",
              data: { kind, label: "", placeholder: true },
              selectable: false,
            }) as Edge
        ),
      ];
      return { nodes, edges };
    });
    return ids;
  },

  fillPlaceholder: (placeholderId, verse, sourceId) => {
    const id = nextId();
    set((s) => {
      const nodes = s.nodes.map((n) =>
        n.id === placeholderId
          ? ({
              id,
              type: "verse",
              position: n.position,
              data: { ...verse, placedFrom: sourceId },
            } as Node)
          : n
      );
      const edges = s.edges.filter((e) => e.target !== placeholderId);
      return {
        nodes,
        edges,
        duplicateNodeIdsByRef: computeDuplicateMap(nodes),
        clearedSnapshot: null,
      };
    });
    get().setNewlyAddedNode(id);
    return id;
  },

  removePlaceholders: (ids) => {
    const gone = new Set(ids);
    set((s) => ({
      nodes: s.nodes.filter((n) => !gone.has(n.id)),
      edges: s.edges.filter((e) => !gone.has(e.target)),
    }));
  },

  settleGroup: (sourceId, ids, fallbackHeight) => {
    const { nodes } = get();
    const source = nodes.find((n) => n.id === sourceId);
    const group = ids.map((id) => nodes.find((n) => n.id === id)).filter((n): n is Node => !!n);
    if (!source || group.length === 0) return;
    const inGroup = new Set(group.map((n) => n.id));
    const positions = placeColumnGroup(
      layoutBox(source, fallbackHeight),
      group.map((n) => nodeHeight(n, fallbackHeight)),
      nodes
        .filter((n) => n.id !== sourceId && !inGroup.has(n.id))
        .map((n) => layoutBox(n, fallbackHeight))
    );
    const byId = new Map(group.map((n, i) => [n.id, positions[i]]));
    set((s) => ({
      nodes: s.nodes.map((n) => (byId.has(n.id) ? { ...n, position: byId.get(n.id)! } : n)),
    }));
  },

  relayout: (fallbackHeight) =>
    set((s) => ({
      nodes: relayoutNodes(s.nodes, fallbackHeight),
      layoutToken: s.layoutToken + 1,
    })),

  resetLayout: (fallbackHeight) =>
    set((s) => {
      const unpinned = s.nodes.map((n) =>
        (n.data as unknown as Verse).pinned ? { ...n, data: { ...n.data, pinned: false } } : n
      );
      return { nodes: relayoutNodes(unpinned, fallbackHeight), layoutToken: s.layoutToken + 1 };
    }),

  clearCanvas: () => {
    const { nodes, edges, reset } = get();
    const snapshot = {
      nodes: nodes.filter((n) => !isPlaceholderNode(n)),
      edges: edges.filter((e) => !isPlaceholderEdge(e)),
    };
    reset();
    if (snapshot.nodes.length > 0) set({ clearedSnapshot: snapshot });
  },

  undoClear: () => {
    const snapshot = get().clearedSnapshot;
    if (!snapshot) return;
    set({
      nodes: snapshot.nodes,
      edges: snapshot.edges,
      duplicateNodeIdsByRef: computeDuplicateMap(snapshot.nodes),
      expansionCountsByNode: computeExpansionCountsMap(snapshot.edges),
      clearedSnapshot: null,
    });
    get().requestFit();
  },

  dismissClearUndo: () => set({ clearedSnapshot: null }),
}));
