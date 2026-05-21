"use client";

import { useEffect, useCallback, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  useReactFlow,
  ReactFlowProvider,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { VerseNode } from "./VerseNode";
import { HikmahEdge } from "./HikmahEdge";
import { useCanvasStore } from "@/store/canvas";
import { useActivityTracker } from "@/hooks/useActivityTracker";
import { useCanvasPersistence } from "@/hooks/useCanvasPersistence";
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

function CanvasInner() {
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

          const pos = radialPos(sourcePos, i, connections.length);
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
    runExpansion(nodeId, verse.ref, "thematic", verse.arabicText, verse.translation, sourceNode.position);
  }, [pendingAutoExpand, setPendingAutoExpand, getNodeById, runExpansion]);

  const handleEdgeClick = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      const fromNode = nodes.find((n) => n.id === edge.source);
      const toNode = nodes.find((n) => n.id === edge.target);
      if (!fromNode || !toNode) return;

      const fromVerse = fromNode.data as unknown as Verse;
      const toVerse = toNode.data as unknown as Verse;
      const edgeData = edge.data as
        | { kind: "thematic" | "root" | "contrast"; label: string; reason?: string }
        | undefined;

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

  return (
    <div className="w-full h-full">
      {expansionError && (
        <div
          className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-md text-xs font-mono pointer-events-none"
          style={{
            background: "var(--color-surface-raised)",
            border: "1px solid var(--color-border)",
            color: "var(--color-text-muted)",
          }}
        >
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
      </ReactFlow>
    </div>
  );
}

export function HikmahCanvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}
