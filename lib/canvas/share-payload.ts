import type { EdgeKind, VerseRef } from "@/types/quran";
import type { SavedCanvas } from "@/store/canvas";

export const SHARE_VERSION = 2;

export interface ShareNode {
  id: string;
  x: number;
  y: number;
  ref: VerseRef;
  isRoot?: boolean;
}

export interface ShareEdge {
  id: string;
  source: string;
  target: string;
  kind: EdgeKind;
}

/**
 * Structural-only wire/storage format for a shared canvas. Verse text and edge
 * reasons are deliberately absent: they are rehydrated from the corpus and the
 * connection graph on read (see lib/canvas/share-hydrate.ts), so a share link
 * can never present content that did not come from those sources.
 */
export interface SharePayload {
  v: typeof SHARE_VERSION;
  nodes: ShareNode[];
  edges: ShareEdge[];
}

export function toSharePayload(canvas: SavedCanvas): SharePayload {
  return {
    v: SHARE_VERSION,
    nodes: canvas.nodes.map((n) => ({
      id: n.id,
      x: n.x,
      y: n.y,
      ref: n.verse.ref,
      ...(n.verse.isRoot ? { isRoot: true } : {}),
    })),
    edges: canvas.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      kind: e.kind,
    })),
  };
}
