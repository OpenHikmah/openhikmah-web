"use client";

import { memo, useEffect } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { Verse, EdgeKind } from "@/types/quran";
import { useCanvasStore } from "@/store/canvas";
import { useAuthStore } from "@/store/auth";
import { cn } from "@/lib/utils";
import { Loader2, Plus, Heart } from "lucide-react";
import { ExpandMenu } from "./ExpandMenu";

type VerseNodeData = Verse & { isRoot?: boolean; isLoading?: boolean };

function VerseNodeInner({ id, data, selected }: NodeProps) {
  const verse = data as unknown as VerseNodeData;

  const expandingNodeId = useCanvasStore((s) => s.expandingNodeId);
  const openExpandNodeId = useCanvasStore((s) => s.openExpandNodeId);
  const setSelectedNode = useCanvasStore((s) => s.setSelectedNode);
  const setOpenExpandNodeId = useCanvasStore((s) => s.setOpenExpandNodeId);
  const setSidebarContent = useCanvasStore((s) => s.setSidebarContent);
  const setPendingExpand = useCanvasStore((s) => s.setPendingExpand);

  const isBookmarked = useAuthStore((s) => s.isBookmarked(verse.ref));
  const toggleBookmark = useAuthStore((s) => s.toggleBookmark);

  const isExpanding = expandingNodeId === id;
  const expandMenuOpen = openExpandNodeId === id;

  useEffect(() => {
    if (selected) {
      setSidebarContent({ type: "node", verse: verse as Verse });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const handleExpandSelect = (kind: EdgeKind) => {
    setPendingExpand({ nodeId: id, ref: verse.ref, kind });
  };

  return (
    <div
      onClick={() => setSelectedNode(selected ? null : id)}
      className={cn(
        "relative w-72 rounded-lg border transition-colors duration-150 cursor-pointer select-none",
        "bg-[var(--color-surface-raised)] border-[var(--color-border)]",
        selected && "node-selected",
        isExpanding && "node-expanding",
        !selected && !isExpanding && "hover:border-[var(--color-text-muted)]"
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2 !h-2 !bg-[var(--color-border)] !border-[var(--color-border-subtle)]"
      />

      <div className="p-3 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span
            className="text-xs font-mono truncate"
            style={{ color: "var(--color-text-muted)" }}
          >
            {verse.surahName}
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            <span
              className="text-xs font-mono px-1.5 py-0.5 rounded border"
              style={
                verse.isRoot
                  ? {
                      color: "var(--color-gold)",
                      borderColor: "var(--color-gold)",
                      background: "rgba(201,168,76,0.08)",
                    }
                  : {
                      color: "var(--color-text-muted)",
                      borderColor: "var(--color-border)",
                    }
              }
            >
              {verse.ref}
            </span>
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                toggleBookmark(verse.ref);
              }}
              aria-label={isBookmarked ? "Remove bookmark" : "Bookmark verse"}
              className="w-5 h-5 flex items-center justify-center rounded transition-colors cursor-pointer hover:text-[var(--color-gold)]"
              style={{
                color: isBookmarked ? "var(--color-gold)" : "var(--color-text-muted)",
              }}
            >
              <Heart
                className="w-3.5 h-3.5"
                fill={isBookmarked ? "currentColor" : "none"}
              />
            </button>
          </div>
        </div>

        <p
          className="font-arabic text-right text-sm leading-loose"
          style={{ color: "var(--color-text-primary)" }}
        >
          {verse.arabicText}
        </p>

        <p
          className="text-xs leading-relaxed line-clamp-3"
          style={{ color: "var(--color-text-secondary)" }}
        >
          {verse.translation}
        </p>
      </div>

      {/* Expand button */}
      <div
        className="flex justify-center pb-2.5"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            setOpenExpandNodeId(expandMenuOpen ? null : id);
          }}
          disabled={isExpanding}
          className={cn(
            "w-6 h-6 rounded border flex items-center justify-center transition-colors cursor-pointer",
            expandMenuOpen
              ? "border-[var(--color-teal)] text-[var(--color-teal)]"
              : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-teal)] hover:text-[var(--color-teal)]",
            "disabled:opacity-40 disabled:cursor-not-allowed"
          )}
          title="Expand connections"
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>

      {expandMenuOpen && (
        <ExpandMenu
          onSelect={handleExpandSelect}
          onClose={() => setOpenExpandNodeId(null)}
        />
      )}

      {isExpanding && (
        <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-[var(--color-surface-raised)]/70">
          <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--color-teal)" }} />
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
