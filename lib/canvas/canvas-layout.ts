/**
 * Layout and edge-construction helpers for the canvas, extracted out of
 * HikmahCanvas.tsx for unit testability.
 *
 * Verse nodes are a fixed width (`w-72` = 288px) and roughly fixed height. When a
 * new node is added — whether by searching a verse onto a populated canvas or by
 * expanding connections — it must land in *empty* space near a desired anchor, not
 * on top of existing nodes. `findFreeSlot` spirals outward from the anchor in
 * node-sized steps and returns the nearest grid slot that overlaps nothing.
 */

import type { CanvasEdge, EdgeKind } from "@/types/quran";

export interface XY {
  x: number;
  y: number;
}

/** Verse-node bounding box + breathing room, in flow units. */
export const NODE_WIDTH = 288;
export const NODE_HEIGHT = 240;
export const NODE_GAP = 48;

export interface LabelObstacle {
  pos: XY;
  /** Full clearance span along X: node width + half-label width (passed directly to overlaps as `w`). */
  w: number;
  /** Full clearance span along Y: node height + half-label height. */
  h: number;
}

export interface FreeSlotOptions {
  width?: number;
  height?: number;
  gap?: number;
  /** How many rings to search before falling back. */
  maxRings?: number;
  /** Extra obstacles (e.g. edge label midpoints) that use a custom bounding box. */
  labelObstacles?: LabelObstacle[];
}

/** Axis-aligned overlap test between two top-left anchored boxes, with a gap margin. */
function overlaps(a: XY, b: XY, w: number, h: number, gap: number): boolean {
  return Math.abs(a.x - b.x) < w + gap && Math.abs(a.y - b.y) < h + gap;
}

/**
 * Find the nearest position to `anchor` whose node box overlaps none of
 * `existing`. Returns `anchor` itself when it is already clear. Searches in
 * expanding square rings (grid-snapped to node+gap steps) and, within each ring,
 * prefers the candidate closest to the anchor so new nodes stay tucked in beside
 * the graph rather than flung far away.
 */
export function findFreeSlot(existing: XY[], anchor: XY, options: FreeSlotOptions = {}): XY {
  const w = options.width ?? NODE_WIDTH;
  const h = options.height ?? NODE_HEIGHT;
  const gap = options.gap ?? NODE_GAP;
  const maxRings = options.maxRings ?? 16;
  const labelObstacles = options.labelObstacles ?? [];

  const collides = (p: XY) =>
    existing.some((q) => overlaps(p, q, w, h, gap)) ||
    labelObstacles.some((o) => overlaps(p, o.pos, o.w, o.h, gap));

  if (!collides(anchor)) return anchor;

  const stepX = w + gap;
  const stepY = h + gap;

  for (let ring = 1; ring <= maxRings; ring++) {
    const candidates: XY[] = [];
    for (let dx = -ring; dx <= ring; dx++) {
      for (let dy = -ring; dy <= ring; dy++) {
        // Perimeter of this ring only — inner rings were already tried.
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        candidates.push({ x: anchor.x + dx * stepX, y: anchor.y + dy * stepY });
      }
    }
    // Nearest-first so the node lands as close to the anchor as possible.
    candidates.sort(
      (p, q) =>
        (p.x - anchor.x) ** 2 +
        (p.y - anchor.y) ** 2 -
        ((q.x - anchor.x) ** 2 + (q.y - anchor.y) ** 2)
    );
    for (const c of candidates) {
      if (!collides(c)) return c;
    }
  }

  // Degenerate fallback (graph absurdly dense): drop it below everything.
  return { x: anchor.x, y: anchor.y + (existing.length + 1) * stepY };
}

/**
 * The flow-coordinate point at the centre of the visible viewport, given the
 * current ReactFlow transform and the viewport pixel size. Used as the anchor for
 * search-added nodes so they appear on-screen. `screenW/screenH` default to the
 * window so callers outside the ReactFlow provider can still compute it.
 */
export function viewportCenter(
  viewport: { x: number; y: number; zoom: number },
  screenW: number,
  screenH: number
): XY {
  const zoom = viewport.zoom || 1;
  return {
    x: (screenW / 2 - viewport.x) / zoom,
    y: (screenH / 2 - viewport.y) / zoom,
  };
}

/** Column placement for verses an expansion adds — see `placeColumnGroup`. */
export const COLUMN_GAP = 112;
export const ROW_GAP = 20;
/** Fallback card heights (flow units) for a card React Flow hasn't measured yet. */
export const CARD_HEIGHT_WITH_ARABIC = 236;
export const CARD_HEIGHT_WITHOUT_ARABIC = 172;
export const PLACEHOLDER_HEIGHT = 196;

const SLIDE_STEP = 20;
const MAX_SLIDE_STEPS = 600;
const EXTRA_COLUMNS = 2;
// Moving a group one column further right costs about four card heights of
// sliding, so a verse's groups only split across columns when the near column
// is really crowded.
const COLUMN_JUMP_COST = 900;

export interface LayoutBox {
  x: number;
  y: number;
  h: number;
}

/**
 * Positions for a group of new cards, stacked top to bottom in a column to the
 * right of `source` and centred on it. The group slides up or down to the
 * nearest space that clears every obstacle in that column; when that is far
 * away, a column further right at the source's own level can win instead.
 * Obstacles are never moved.
 */
export function placeColumnGroup(
  source: LayoutBox,
  heights: number[],
  obstacles: LayoutBox[]
): XY[] {
  if (heights.length === 0) return [];
  const blockH = heights.reduce((a, b) => a + b, 0) + ROW_GAP * (heights.length - 1);
  const desiredTop = source.y + source.h / 2 - blockH / 2;

  let best: { x: number; top: number; cost: number } | null = null;
  for (let col = 0; col <= EXTRA_COLUMNS; col++) {
    const x = source.x + (NODE_WIDTH + COLUMN_GAP) * (col + 1);
    const inColumn = obstacles.filter(
      (o) => o.x < x + NODE_WIDTH + ROW_GAP && o.x + NODE_WIDTH + ROW_GAP > x
    );
    const fits = (top: number) =>
      inColumn.every((o) => top + blockH + ROW_GAP <= o.y || top >= o.y + o.h + ROW_GAP);
    for (let i = 0; i < MAX_SLIDE_STEPS; i++) {
      const offset = Math.ceil(i / 2) * SLIDE_STEP * (i % 2 ? 1 : -1);
      if (!fits(desiredTop + offset)) continue;
      const cost = Math.abs(offset) + col * COLUMN_JUMP_COST;
      if (!best || cost < best.cost) best = { x, top: desiredTop + offset, cost };
      break;
    }
  }

  const x = best?.x ?? source.x + NODE_WIDTH + COLUMN_GAP;
  let y = best?.top ?? desiredTop;
  return heights.map((h) => {
    const p = { x, y };
    y += h + ROW_GAP;
    return p;
  });
}

export interface LayoutNode extends LayoutBox {
  id: string;
  /** Source card of the expansion that added this card, if one did. */
  placedFrom?: string;
  /** Moved by hand — keeps its position. */
  pinned?: boolean;
}

/**
 * Re-places every card an expansion added, replaying the expansions in the
 * order they happened (node order), with current card heights. Cards no
 * expansion added (search results, surah ayahs) and cards moved by hand keep
 * their positions and act as obstacles from the start. Consecutive cards from
 * the same source form one group. Returns the new position of every card.
 */
export function relayoutCanvas(nodes: LayoutNode[]): Map<string, XY> {
  const ids = new Set(nodes.map((n) => n.id));
  const isAuto = (n: LayoutNode) => !!n.placedFrom && !n.pinned && ids.has(n.placedFrom);
  const placed = new Map<string, LayoutBox>();
  for (const n of nodes) if (!isAuto(n)) placed.set(n.id, { x: n.x, y: n.y, h: n.h });

  let i = 0;
  while (i < nodes.length) {
    const n = nodes[i];
    if (!isAuto(n)) {
      i++;
      continue;
    }
    const group = [n];
    while (
      i + group.length < nodes.length &&
      isAuto(nodes[i + group.length]) &&
      nodes[i + group.length].placedFrom === n.placedFrom
    ) {
      group.push(nodes[i + group.length]);
    }
    const source = placed.get(n.placedFrom as string);
    const positions = source
      ? placeColumnGroup(
          source,
          group.map((g) => g.h),
          [...placed.values()]
        )
      : group.map((g) => ({ x: g.x, y: g.y }));
    group.forEach((g, k) => placed.set(g.id, { ...positions[k], h: g.h }));
    i += group.length;
  }

  return new Map([...placed].map(([id, b]) => [id, { x: b.x, y: b.y }]));
}

const EDGE_LABEL_MAX = 60;

/** Short edge label derived from a connection's reason. */
export function connectionLabel(reason: string): string {
  return reason.slice(0, EDGE_LABEL_MAX);
}

/**
 * Builds the edge for an expansion connection, whether its target is a
 * freshly-added node or one that already existed elsewhere on the canvas (the
 * AI still identified a real relationship even when no new node is created).
 * Returns null for a self-loop — a source node's own ref showing up as a
 * "connection" to itself, which should draw nothing.
 */
export function buildConnectionEdge(
  sourceNodeId: string,
  targetNodeId: string,
  conn: { kind: EdgeKind; reason: string }
): CanvasEdge | null {
  if (targetNodeId === sourceNodeId) return null;
  return {
    id: `edge-${sourceNodeId}-${targetNodeId}`,
    source: sourceNodeId,
    target: targetNodeId,
    type: "hikmah",
    data: {
      kind: conn.kind,
      label: connectionLabel(conn.reason),
      reason: conn.reason,
    },
  };
}
