"use client";

import { memo } from "react";
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react";
import type { EdgeKind } from "@/types/quran";

const EDGE_COLORS: Record<EdgeKind, string> = {
  thematic: "var(--color-theme-edge)",
  root: "var(--color-root-edge)",
  contrast: "var(--color-contrast-edge)",
};

function HikmahEdgeInner({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps) {
  const kind: EdgeKind = (data as { kind: EdgeKind })?.kind ?? "thematic";
  const label: string = (data as { label: string })?.label ?? "";
  const color = EDGE_COLORS[kind];

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={{ stroke: color, strokeWidth: 1.5, opacity: 0.7 }} />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: "all",
              backgroundColor: "var(--color-surface-raised)",
              color,
              borderColor: color,
              opacity: 0.85,
              fontSize: "10px",
              fontFamily: "var(--font-mono)",
              padding: "2px 8px",
              borderRadius: "9999px",
              border: `1px solid ${color}`,
              whiteSpace: "nowrap",
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const HikmahEdge = memo(HikmahEdgeInner);
