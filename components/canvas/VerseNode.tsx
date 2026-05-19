"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { Verse } from "@/types/quran";
import { useCanvasStore } from "@/store/canvas";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

type VerseNodeData = Verse & { isRoot?: boolean; isLoading?: boolean };

function VerseNodeInner({ id, data, selected }: NodeProps) {
  const verse = data as unknown as VerseNodeData;
  const expandingNodeId = useCanvasStore((s) => s.expandingNodeId);
  const setSelected = useCanvasStore((s) => s.setSelectedNode);
  const isExpanding = expandingNodeId === id;

  return (
    <div
      onClick={() => setSelected(selected ? null : id)}
      className={cn(
        "relative w-72 rounded-xl border transition-all duration-300 cursor-pointer select-none",
        "bg-[var(--color-surface-raised)] border-[var(--color-border)]",
        selected && "border-[var(--color-gold)] gold-glow",
        isExpanding && "border-[var(--color-teal)] teal-glow",
        !selected && !isExpanding && "hover:border-[var(--color-border-subtle)] hover:border-opacity-80"
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2 !h-2 !bg-[var(--color-border)] !border-[var(--color-border-subtle)]"
      />

      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono text-[var(--color-text-muted)] tracking-wider uppercase">
            {verse.surahName}
          </span>
          <span
            className={cn(
              "text-xs font-mono px-2 py-0.5 rounded-full border",
              verse.isRoot
                ? "text-[var(--color-gold)] border-[var(--color-gold)] border-opacity-40 bg-[var(--color-gold)] bg-opacity-10"
                : "text-[var(--color-text-muted)] border-[var(--color-border)]"
            )}
          >
            {verse.ref}
          </span>
        </div>

        <p className="font-arabic text-right text-base leading-loose text-[var(--color-text-primary)]">
          {verse.arabicText}
        </p>

        <p className="text-xs leading-relaxed text-[var(--color-text-secondary)] line-clamp-3">
          {verse.translation}
        </p>
      </div>

      {isExpanding && (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-[var(--color-surface-raised)] bg-opacity-60 backdrop-blur-sm">
          <Loader2 className="w-5 h-5 text-[var(--color-teal)] animate-spin" />
        </div>
      )}

      <Handle
        type="source"
        position={Position.Right}
        className="!w-2 !h-2 !bg-[var(--color-border)] !border-[var(--color-border-subtle)]"
      />
    </div>
  );
}

export const VerseNode = memo(VerseNodeInner);
