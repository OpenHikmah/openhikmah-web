/**
 * Collision-aware node placement for the canvas.
 *
 * Verse nodes are a fixed width (`w-72` = 288px) and roughly fixed height. When a
 * new node is added — whether by searching a verse onto a populated canvas or by
 * expanding connections — it must land in *empty* space near a desired anchor, not
 * on top of existing nodes. `findFreeSlot` spirals outward from the anchor in
 * node-sized steps and returns the nearest grid slot that overlaps nothing.
 */

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
