import type { SavedCanvas, SavedEdge, SavedNode } from "@/store/canvas";
import type { EdgeKind, Verse } from "@/types/quran";

const EDGE_KINDS: readonly EdgeKind[] = ["thematic", "root", "contrast"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validates an untrusted saved-canvas payload (share-link response, saved
 * workspace row, localStorage) and rebuilds it from known fields only.
 * Missing `edges` means nodes only. Dangling, duplicate-pair, self-loop and
 * malformed edges are dropped; any bad node (id, non-finite position, verse
 * without a ref) rejects the whole payload.
 */
export function parseSavedCanvas(input: unknown): SavedCanvas | null {
  if (!isRecord(input) || input.v !== 1) return null;
  const { nodes: rawNodes, edges: rawEdges } = input;
  if (!Array.isArray(rawNodes) || rawNodes.length === 0) return null;
  if (rawEdges !== undefined && !Array.isArray(rawEdges)) return null;

  const nodes: SavedNode[] = [];
  const nodeIds = new Set<string>();
  for (const raw of rawNodes) {
    if (!isRecord(raw)) return null;
    const { id, x, y, verse } = raw;
    if (typeof id !== "string" || id.length === 0 || nodeIds.has(id)) return null;
    if (
      typeof x !== "number" ||
      typeof y !== "number" ||
      !Number.isFinite(x) ||
      !Number.isFinite(y)
    ) {
      return null;
    }
    if (!isRecord(verse) || typeof verse.ref !== "string") return null;
    nodeIds.add(id);
    nodes.push({ id, x, y, verse: verse as unknown as Verse });
  }

  const edges: SavedEdge[] = [];
  const seenPairs = new Set<string>();
  for (const raw of rawEdges ?? []) {
    if (!isRecord(raw)) continue;
    const { id, source, target, kind, label, reason } = raw;
    if (typeof id !== "string" || id.length === 0) continue;
    if (typeof source !== "string" || typeof target !== "string") continue;
    if (source === target) continue;
    if (typeof kind !== "string" || !EDGE_KINDS.includes(kind as EdgeKind)) continue;
    if (!nodeIds.has(source) || !nodeIds.has(target)) continue;
    const pair = source < target ? `${source}|${target}` : `${target}|${source}`;
    if (seenPairs.has(pair)) continue;
    seenPairs.add(pair);
    edges.push({
      id,
      source,
      target,
      kind: kind as EdgeKind,
      label: typeof label === "string" ? label : "",
      reason: typeof reason === "string" ? reason : "",
    });
  }

  return { v: 1, nodes, edges };
}
