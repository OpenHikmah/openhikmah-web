"use client";

import { memo, useState, useEffect } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { Verse, EdgeKind } from "@/types/quran";
import { useCanvasStore } from "@/store/canvas";
import { cn } from "@/lib/utils";
import { Loader2, Plus } from "lucide-react";
import { ExpandMenu } from "./ExpandMenu";

type VerseNodeData = Verse & { isRoot?: boolean; isLoading?: boolean };

function VerseNodeInner({ id, data, selected }: NodeProps) {
  const verse = data as unknown as VerseNodeData;
  const [expandMenuOpen, setExpandMenuOpen] = useState(false);

  const expandingNodeId = useCanvasStore((s) => s.expandingNodeId);
  const setSelected = useCanvasStore((s) => s.setSelectedNode);
  const setSidebarContent = useCanvasStore((s) => s.setSidebarContent);
  const setPendingExpand = useCanvasStore((s) => s.setPendingExpand);
  const isExpanding = expandingNodeId === id;

  useEffect(() => {
    if (selected) {
      setSidebarContent({ type: "node", verse: verse as Verse });
    }
  }, [selected, verse, setSidebarContent]);

  const handleExpandSelect = (kind: EdgeKind) => {
    setPendingExpand({ nodeId: id, ref: verse.ref, kind });
  };

  return (
    <div
      onClick={() => setSelected(selected ? null : id)}
      className={cn(
        "relative w-72 rounded-xl border transition-all duration-300 cursor-pointer select-none",
        "bg-[var(--color-surface-raised)] border-[var(--color-border)]",
        selected && "border-[var(--color-gold)] gold-glow",
        isExpanding && "border-[var(--color-teal)] teal-glow",
        !selected &&
          !isExpanding &&
          "hover:border-[var(--color-border-subtle)] hover:border-opacity-80"
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

      <div
        className="flex justify-center pb-3"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            setExpandMenuOpen((o) => !o);
          }}
          disabled={isExpanding}
          className={cn(
            "w-7 h-7 rounded-full border flex items-center justify-center transition-all",
            "hover:border-[var(--color-teal)] hover:text-[var(--color-teal)]",
            expandMenuOpen
              ? "border-[var(--color-teal)] text-[var(--color-teal)] bg-[var(--color-teal)] bg-opacity-10"
              : "border-[var(--color-border)] text-[var(--color-text-muted)]",
            "disabled:opacity-40 disabled:cursor-not-allowed"
          )}
          title="Expand connections"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {expandMenuOpen && (
        <ExpandMenu
          onSelect={handleExpandSelect}
          onClose={() => setExpandMenuOpen(false)}
        />
      )}

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
