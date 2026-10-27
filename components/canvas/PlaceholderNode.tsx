"use client";

import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { PLACEHOLDER_HEIGHT } from "@/lib/canvas/canvas-layout";

const BAR = "block h-[9px] rounded animate-pulse bg-border";

/** Dashed stand-in that shows where a verse from a running expansion will land. */
function PlaceholderNodeInner() {
  return (
    <div
      aria-hidden="true"
      style={{ height: PLACEHOLDER_HEIGHT }}
      className="node-entrance flex w-72 flex-col gap-[11px] rounded-[10px] border border-dashed border-text-muted/40 bg-surface-raised/50 p-3.5"
    >
      <Handle type="target" position={Position.Left} isConnectable={false} className="!opacity-0" />
      <div className="flex justify-between">
        <span className={`${BAR} w-[38%]`} />
        <span className={`${BAR} w-[16%]`} />
      </div>
      <span className={`${BAR} mb-1 h-[13px] w-[82%] self-end`} />
      <span className={`${BAR} w-full`} />
      <span className={`${BAR} w-[94%]`} />
      <span className={`${BAR} w-[60%]`} />
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={false}
        className="!opacity-0"
      />
    </div>
  );
}

export const PlaceholderNode = memo(PlaceholderNodeInner);
