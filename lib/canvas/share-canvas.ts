import { isValidRef } from "@/lib/quran/quran-corpus";
import type { EdgeKind, VerseRef } from "@/types/quran";
import {
  SHARE_VERSION,
  type ShareEdge,
  type ShareNode,
  type SharePayload,
} from "@/lib/canvas/share-payload";

export const MAX_SHARE_NODES = 500;
export const MAX_SHARE_EDGES = 2000;
export const SHARE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const COORD_LIMIT = 1_000_000;
const ID_RE = /^[\w-]{1,128}$/;
const EDGE_KINDS: readonly EdgeKind[] = ["thematic", "root", "contrast"];

export type ParseShareResult = { ok: true; payload: SharePayload } | { ok: false; error: string };

function fail(error: string): ParseShareResult {
  return { ok: false, error };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isId(value: unknown): value is string {
  return typeof value === "string" && ID_RE.test(value);
}

function isCoord(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= COORD_LIMIT;
}

/**
 * Validates an untrusted shared-canvas payload and rebuilds it from known
 * fields only, so nothing the client sent beyond ids, positions, verse refs and
 * edge kinds is ever stored. Used by `POST /api/share` and when reading rows
 * back (rows written before the v2 format fail the version check).
 */
export function parseSharePayload(input: unknown): ParseShareResult {
  if (!isRecord(input) || input.v !== SHARE_VERSION) return fail("Unsupported canvas version");
  const { nodes: rawNodes, edges: rawEdges } = input;
  if (!Array.isArray(rawNodes) || rawNodes.length === 0 || rawNodes.length > MAX_SHARE_NODES) {
    return fail("Invalid nodes");
  }
  if (!Array.isArray(rawEdges) || rawEdges.length > MAX_SHARE_EDGES) {
    return fail("Invalid edges");
  }

  const nodes: ShareNode[] = [];
  const nodeIds = new Set<string>();
  for (const raw of rawNodes) {
    if (!isRecord(raw)) return fail("Invalid node");
    const { id, x, y, ref, isRoot } = raw;
    if (!isId(id) || nodeIds.has(id)) return fail("Invalid node id");
    if (!isCoord(x) || !isCoord(y)) return fail("Invalid node position");
    if (typeof ref !== "string" || !isValidRef(ref)) return fail("Invalid verse reference");
    if (isRoot !== undefined && typeof isRoot !== "boolean") return fail("Invalid node");
    nodeIds.add(id);
    nodes.push({ id, x, y, ref: ref as VerseRef, ...(isRoot ? { isRoot: true } : {}) });
  }

  const edges: ShareEdge[] = [];
  for (const raw of rawEdges) {
    if (!isRecord(raw)) return fail("Invalid edge");
    const { id, source, target, kind } = raw;
    if (!isId(id) || !isId(source) || !isId(target)) return fail("Invalid edge");
    if (!nodeIds.has(source) || !nodeIds.has(target) || source === target) {
      return fail("Invalid edge endpoints");
    }
    if (typeof kind !== "string" || !EDGE_KINDS.includes(kind as EdgeKind)) {
      return fail("Invalid edge kind");
    }
    edges.push({ id, source, target, kind: kind as EdgeKind });
  }

  return { ok: true, payload: { v: SHARE_VERSION, nodes, edges } };
}
