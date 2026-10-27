"use client";

import { memo, useState } from "react";
import {
  EdgeLabelRenderer,
  useInternalNode,
  type EdgeProps,
  type InternalNode,
} from "@xyflow/react";
import { useTranslations } from "next-intl";
import type { EdgeKind } from "@/types/quran";
import { useCanvasStore, selectFocus } from "@/store/canvas";
import { cn } from "@/lib/utils";

const EDGE_COLORS: Record<EdgeKind, string> = {
  thematic: "var(--color-theme-edge)",
  root: "var(--color-root-edge)",
  contrast: "var(--color-contrast-edge)",
};

const KIND_GLYPH: Record<EdgeKind, string> = { thematic: "◈", root: "ع", contrast: "↔" };
const KIND_LABEL_KEY = {
  thematic: "legendTheme",
  root: "legendRoot",
  contrast: "legendContrast",
} as const;

type XY = { x: number; y: number };

function box(n: InternalNode) {
  const { x, y } = n.internals.positionAbsolute;
  return { x, y, w: n.measured.width ?? 0, h: n.measured.height ?? 0 };
}

/** Bezier between the nearest sides of two cards, so a line never loops around a card. */
export function floatingPath(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number }
): { path: string; mid: XY } {
  let p0: XY, p3: XY, horizontal: boolean;
  if (b.x > a.x + a.w + 40) {
    p0 = { x: a.x + a.w, y: a.y + a.h / 2 };
    p3 = { x: b.x, y: b.y + b.h / 2 };
    horizontal = true;
  } else if (b.x + b.w < a.x - 40) {
    p0 = { x: a.x, y: a.y + a.h / 2 };
    p3 = { x: b.x + b.w, y: b.y + b.h / 2 };
    horizontal = true;
  } else if (b.y > a.y) {
    p0 = { x: a.x + a.w / 2, y: a.y + a.h };
    p3 = { x: b.x + b.w / 2, y: b.y };
    horizontal = false;
  } else {
    p0 = { x: a.x + a.w / 2, y: a.y };
    p3 = { x: b.x + b.w / 2, y: b.y + b.h };
    horizontal = false;
  }
  const off = Math.max(50, Math.hypot(p3.x - p0.x, p3.y - p0.y) * 0.35);
  const sx = Math.sign(p3.x - p0.x) || 1;
  const sy = Math.sign(p3.y - p0.y) || 1;
  const p1 = horizontal ? { x: p0.x + sx * off, y: p0.y } : { x: p0.x, y: p0.y + sy * off };
  const p2 = horizontal ? { x: p3.x - sx * off, y: p3.y } : { x: p3.x, y: p3.y - sy * off };
  return {
    path: `M${p0.x},${p0.y} C${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y}`,
    mid: {
      x: (p0.x + 3 * p1.x + 3 * p2.x + p3.x) / 8,
      y: (p0.y + 3 * p1.y + 3 * p2.y + p3.y) / 8,
    },
  };
}

function HikmahEdgeInner({ id, source, target, data }: EdgeProps) {
  const t = useTranslations("canvas");
  const kind: EdgeKind = (data as { kind: EdgeKind })?.kind ?? "thematic";
  const placeholder = !!(data as { placeholder?: boolean })?.placeholder;
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  const [hovered, setHovered] = useState(false);
  const panelHover = useCanvasStore((s) => s.hoveredEdgeId === id);
  const focus = useCanvasStore((s) => {
    const f = selectFocus(s);
    if (!f) return "none";
    return f.edges.has(id) ? "focus" : "dim";
  });

  if (!sourceNode?.measured.width || !targetNode?.measured.width) return null;
  const { path, mid } = floatingPath(box(sourceNode), box(targetNode));
  const color = EDGE_COLORS[kind];
  const lit = hovered || panelHover;

  return (
    <>
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeDasharray="5 5"
        className={cn(
          "react-flow__edge-path transition-[opacity,stroke-width] duration-200",
          (lit || focus === "focus" || placeholder) && "hikmah-edge-flow"
        )}
        style={{
          stroke: color,
          strokeWidth: lit ? 2.5 : focus === "focus" ? 2.25 : 1.5,
          opacity: placeholder ? 0.55 : lit || focus === "focus" ? 1 : focus === "dim" ? 0.12 : 0.6,
        }}
      />
      {!placeholder && (
        <path
          d={path}
          fill="none"
          stroke="transparent"
          strokeWidth={18}
          className="react-flow__edge-interaction cursor-pointer"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        />
      )}
      {lit && !placeholder && (
        <EdgeLabelRenderer>
          <div
            className="pointer-events-none absolute rounded-full border bg-surface px-2.5 py-0.5 font-mono text-[11px] whitespace-nowrap"
            style={{
              transform: `translate(-50%, -50%) translate(${mid.x}px, ${mid.y}px)`,
              color,
              borderColor: color,
            }}
          >
            {KIND_GLYPH[kind]} {t(KIND_LABEL_KEY[kind])}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const HikmahEdge = memo(HikmahEdgeInner);
