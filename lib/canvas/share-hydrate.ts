import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/infra/db";
import { connections, sharedCanvases } from "@/lib/infra/db/schema";
import { getVerses } from "@/lib/quran/quran-corpus";
import { resolveVerse } from "@/lib/quran/verse-resolver";
import { connectionLabel } from "@/lib/canvas/canvas-layout";
import { SHARE_TTL_MS, parseSharePayload } from "@/lib/canvas/share-canvas";
import type { SharePayload } from "@/lib/canvas/share-payload";
import type { SavedCanvas, SavedEdge, SavedNode } from "@/store/canvas";
import type { Verse } from "@/types/quran";

export type LoadedShare =
  { status: "ok"; payload: SharePayload } | { status: "missing" } | { status: "corrupt" };

/**
 * Reads a stored share. Rows past the TTL and rows in an older payload format
 * (which carried client-supplied verse text) are treated as missing.
 */
export async function loadSharePayload(id: string): Promise<LoadedShare> {
  const rows = await db.select().from(sharedCanvases).where(eq(sharedCanvases.id, id)).limit(1);
  const row = rows[0];
  if (!row) return { status: "missing" };
  if (Date.now() - row.createdAt.getTime() > SHARE_TTL_MS) return { status: "missing" };

  let raw: unknown;
  try {
    raw = JSON.parse(row.data);
  } catch (err) {
    console.error("share parse error:", err);
    return { status: "corrupt" };
  }
  const parsed = parseSharePayload(raw);
  return parsed.ok ? { status: "ok", payload: parsed.payload } : { status: "missing" };
}

/**
 * Rebuilds a full canvas from a structural share payload: verse text comes from
 * the corpus (live fetch only for refs the corpus lacks) and edge kind/reason
 * from the active connection graph. An edge with no active graph row is
 * dropped rather than shown with client-supplied text. Returns null when a verse
 * cannot be resolved.
 */
export async function hydrateSharePayload(payload: SharePayload): Promise<SavedCanvas | null> {
  const refs = [...new Set(payload.nodes.map((n) => n.ref))];
  const byRef = new Map<string, Verse>(await getVerses(refs));
  for (const ref of refs) {
    if (byRef.has(ref)) continue;
    const verse = await resolveVerse(ref);
    if (!verse) return null;
    byRef.set(ref, verse);
  }

  const nodes: SavedNode[] = payload.nodes.map((n) => ({
    id: n.id,
    x: n.x,
    y: n.y,
    verse: { ...(byRef.get(n.ref) as Verse), ...(n.isRoot ? { isRoot: true } : {}) },
  }));

  return { v: 1, nodes, edges: await hydrateEdges(payload, byRef) };
}

async function hydrateEdges(payload: SharePayload, byRef: Map<string, Verse>) {
  if (payload.edges.length === 0) return [];

  const refById = new Map(payload.nodes.map((n) => [n.id, n.ref]));
  const refs = [...byRef.keys()];
  const rows = await db
    .select({
      fromRef: connections.fromRef,
      toRef: connections.toRef,
      kind: connections.kind,
      reason: connections.reason,
    })
    .from(connections)
    .where(
      and(
        eq(connections.status, "active"),
        eq(connections.locale, "en"),
        inArray(connections.fromRef, refs),
        inArray(connections.toRef, refs)
      )
    );
  const reasons = new Map(rows.map((r) => [`${r.fromRef}|${r.toRef}|${r.kind}`, r.reason]));

  const edges: SavedEdge[] = [];
  for (const e of payload.edges) {
    const from = refById.get(e.source) as string;
    const to = refById.get(e.target) as string;
    const reason = reasons.get(`${from}|${to}|${e.kind}`) ?? reasons.get(`${to}|${from}|${e.kind}`);
    if (reason === undefined) continue;
    edges.push({
      id: e.id,
      source: e.source,
      target: e.target,
      kind: e.kind,
      label: connectionLabel(reason),
      reason,
    });
  }
  return edges;
}
