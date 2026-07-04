"use client";

import { useEffect, useCallback, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  MiniMap,
  Panel,
  useReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { VerseNode } from "./VerseNode";
import { HikmahEdge } from "./HikmahEdge";
import { CanvasLegend } from "./CanvasLegend";
import { CanvasToolbar } from "./CanvasToolbar";
import { useCanvasStore } from "@/store/canvas";
import { useActivityTracker } from "@/hooks/useActivityTracker";
import { useCanvasPersistence } from "@/hooks/useCanvasPersistence";
import { findFreeSlot, NODE_WIDTH, NODE_HEIGHT } from "@/lib/canvas-layout";
import type { ConnectionResult, Verse } from "@/types/quran";

const nodeTypes = { verse: VerseNode };
const edgeTypes = { hikmah: HikmahEdge };

function radialPos(
  src: { x: number; y: number },
  i: number,
  total: number
): { x: number; y: number } {
  const radius = 460;
  const spread = Math.PI / 2.5;
  const baseAngle = -spread / 2;
  const angle = total > 1 ? baseAngle + (i / (total - 1)) * spread : 0;
  return {
    x: src.x + radius * Math.cos(angle),
    y: src.y + radius * Math.sin(angle),
  };
}

function CanvasInner({ onSearchOpen }: { onSearchOpen: () => void }) {
  useActivityTracker();
  useCanvasPersistence();

  const reactFlow = useReactFlow();
  const expandingRef = useRef(false);
  const mountedRef = useRef(true);
  const [expansionError, setExpansionError] = useState<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const onNodesChange = useCanvasStore((s) => s.onNodesChange);
  const onEdgesChange = useCanvasStore((s) => s.onEdgesChange);
  const pendingExpand = useCanvasStore((s) => s.pendingExpand);
  const pendingAutoExpand = useCanvasStore((s) => s.pendingAutoExpand);
  const addVerseNode = useCanvasStore((s) => s.addVerseNode);
  const addConnectionEdge = useCanvasStore((s) => s.addConnectionEdge);
  const setExpandingNode = useCanvasStore((s) => s.setExpandingNode);
  const setPendingExpand = useCanvasStore((s) => s.setPendingExpand);
  const setPendingAutoExpand = useCanvasStore((s) => s.setPendingAutoExpand);
  const setOpenExpandNodeId = useCanvasStore((s) => s.setOpenExpandNodeId);
  const setSidebarContent = useCanvasStore((s) => s.setSidebarContent);
  const setViewport = useCanvasStore((s) => s.setViewport);
  const getNodeById = useCanvasStore((s) => s.getNodeById);
  const hasNode = useCanvasStore((s) => s.hasNode);

  const runExpansion = useCallback(
    async (
      nodeId: string,
      ref: string,
      kind: "thematic" | "root" | "contrast",
      arabicText: string,
      translation: string,
      sourcePos: { x: number; y: number }
    ) => {
      if (expandingRef.current) return;
      expandingRef.current = true;
      setExpandingNode(nodeId);

      try {
        const res = await fetch("/api/connections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fromRef: ref, kind, arabicText, translation }),
        });

        if (!res.ok) throw new Error("Connections API failed");

        const connections: ConnectionResult[] = await res.json();

        for (let i = 0; i < connections.length; i++) {
          await new Promise<void>((resolve) => setTimeout(resolve, 350 * i));
          if (!mountedRef.current) break;

          const conn = connections[i];
          if (hasNode(conn.ref)) continue;

          // Fan out radially, then nudge off any collision with the live graph
          // (including siblings added moments ago in this same expansion).
          const target = radialPos(sourcePos, i, connections.length);
          const state = useCanvasStore.getState();
          const existing = state.nodes.map((n) => n.position);
          // Edge labels (AI explanation pills, ~120×22px) render at edge midpoints.
          // Treat them as slim obstacles so new nodes avoid overlapping them without
          // being pushed as far as a full node would require.
          const labelObstacles = state.edges.flatMap((e) => {
            const src = state.nodes.find((n) => n.id === e.source);
            const tgt = state.nodes.find((n) => n.id === e.target);
            if (!src || !tgt) return [];
            return [
              {
                pos: {
                  x: (src.position.x + tgt.position.x) / 2,
                  y: (src.position.y + tgt.position.y) / 2,
                },
                w: NODE_WIDTH + 60, // full node width + half-label width
                h: NODE_HEIGHT + 16, // full node height + half-label height
              },
            ];
          });
          const pos = findFreeSlot(existing, target, { labelObstacles });
          const newId = addVerseNode(conn as unknown as Verse, pos);

          addConnectionEdge({
            id: `edge-${nodeId}-${newId}`,
            source: nodeId,
            target: newId,
            type: "hikmah",
            data: {
              kind: conn.kind,
              label: conn.reason.slice(0, 60),
              reason: conn.reason,
            },
          });
        }

        if (mountedRef.current) {
          await new Promise<void>((resolve) => setTimeout(resolve, 400));
          reactFlow.fitView({ padding: 0.35, maxZoom: 1, duration: 600 });
        }
      } catch (err) {
        console.error("Expansion failed:", err);
        if (mountedRef.current) {
          setExpansionError("Could not find connections. Try a different type.");
          setTimeout(() => setExpansionError(null), 3500);
        }
      } finally {
        if (mountedRef.current) setExpandingNode(null);
        expandingRef.current = false;
      }
    },
    [addVerseNode, addConnectionEdge, setExpandingNode, hasNode, reactFlow]
  );

  useEffect(() => {
    if (!pendingExpand) return;
    const { nodeId, ref, kind } = pendingExpand;
    setPendingExpand(null);
    const sourceNode = getNodeById(nodeId);
    if (!sourceNode) return;
    const verse = sourceNode.data as unknown as Verse;
    runExpansion(nodeId, ref, kind, verse.arabicText, verse.translation, sourceNode.position);
  }, [pendingExpand, setPendingExpand, getNodeById, runExpansion]);

  useEffect(() => {
    if (!pendingAutoExpand) return;
    const nodeId = pendingAutoExpand;
    setPendingAutoExpand(null);
    const sourceNode = getNodeById(nodeId);
    if (!sourceNode) return;
    const verse = sourceNode.data as unknown as Verse;
    runExpansion(
      nodeId,
      verse.ref,
      "thematic",
      verse.arabicText,
      verse.translation,
      sourceNode.position
    );
  }, [pendingAutoExpand, setPendingAutoExpand, getNodeById, runExpansion]);

  const handleEdgeClick = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      const fromNode = nodes.find((n) => n.id === edge.source);
      const toNode = nodes.find((n) => n.id === edge.target);
      if (!fromNode || !toNode) return;

      const fromVerse = fromNode.data as unknown as Verse;
      const toVerse = toNode.data as unknown as Verse;
      const edgeData = edge.data as
        { kind: "thematic" | "root" | "contrast"; label: string; reason?: string } | undefined;

      setSidebarContent({
        type: "edge",
        fromVerse,
        toVerse,
        reason: edgeData?.reason ?? edgeData?.label ?? "",
        kind: edgeData?.kind ?? "thematic",
        label: edgeData?.label ?? "",
      });
    },
    [nodes, setSidebarContent]
  );

  const handlePaneClick = useCallback(() => {
    setOpenExpandNodeId(null);
  }, [setOpenExpandNodeId]);

  const handleMove = useCallback(
    (_: unknown, vp: { x: number; y: number; zoom: number }) => {
      setViewport(vp);
    },
    [setViewport]
  );

  return (
    <div className="w-full h-full">
      {expansionError && (
        <div className="pointer-events-none absolute bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-md border border-border bg-surface-raised px-4 py-2 font-mono text-xs text-text-muted md:bottom-6">
          {expansionError}
        </div>
      )}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onEdgeClick={handleEdgeClick}
        onPaneClick={handlePaneClick}
        onMove={handleMove}
        fitView
        fitViewOptions={{ padding: 0.4, maxZoom: 1 }}
        minZoom={0.1}
        maxZoom={2.5}
        proOptions={{ hideAttribution: true }}
        style={{ background: "var(--color-bg)" }}
        defaultEdgeOptions={{ animated: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1}
          color="var(--color-border)"
          style={{ opacity: 0.4 }}
        />
        {nodes.length > 0 && (
          <>
            <CanvasToolbar onSearchOpen={onSearchOpen} />
            <Panel position="bottom-left">
              <CanvasLegend />
            </Panel>
            <MiniMap
              pannable
              zoomable
              ariaLabel="Canvas minimap"
              nodeColor={(n: Node) =>
                (n.data as { isRoot?: boolean })?.isRoot
                  ? "var(--color-gold)"
                  : "var(--color-text-secondary)"
              }
              nodeStrokeWidth={0}
              maskColor="color-mix(in srgb, var(--color-bg) 72%, transparent)"
              className="hidden rounded-md border border-border sm:block"
              style={{ background: "var(--color-surface)" }}
            />
          </>
        )}
      </ReactFlow>
    </div>
  );
}

export function HikmahCanvas({ onSearchOpen }: { onSearchOpen: () => void }) {
  return (
    <ReactFlowProvider>
      <CanvasInner onSearchOpen={onSearchOpen} />
    </ReactFlowProvider>
  );
}
