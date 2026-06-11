"use client";

import { memo, useEffect } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { Verse, EdgeKind } from "@/types/quran";
import { useCanvasStore } from "@/store/canvas";
import { useAuthStore } from "@/store/auth";
import { cn } from "@/lib/utils";
import { Loader2, Plus, Heart, Volume2 } from "lucide-react";
import { IconButton, Tooltip } from "@/components/ui";
import { ExpandMenu } from "./ExpandMenu";
import { useAudioStore } from "@/store/audio";

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

  const playVerse = useAudioStore((s) => s.playVerse);
  const currentRef = useAudioStore((s) => s.currentRef);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const pauseAudio = useAudioStore((s) => s.pause);
  const resumeAudio = useAudioStore((s) => s.resume);
  const isThisPlaying = currentRef === verse.ref && isPlaying;

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
        "relative w-72 rounded-lg border transition-colors duration-150 cursor-pointer select-none node-entrance",
        "bg-surface-raised border-border",
        selected && "node-selected",
        isExpanding && "node-expanding",
        !selected && !isExpanding && "hover:border-text-muted"
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2 !h-2 !bg-border !border-border-subtle"
      />

      <div className="p-3 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-mono truncate text-text-muted">
            {verse.surahName}
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            <span
              className={cn(
                "text-xs font-mono px-1.5 py-0.5 rounded border",
                verse.isRoot
                  ? "text-gold border-gold bg-gold/10"
                  : "text-text-muted border-border"
              )}
            >
              {verse.ref}
            </span>
            <Tooltip label={isThisPlaying ? "Pause recitation" : "Play recitation"}>
              <IconButton
                size="xs"
                tone="teal"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  if (isThisPlaying) {
                    pauseAudio();
                  } else if (currentRef === verse.ref) {
                    resumeAudio();
                  } else {
                    playVerse({ ref: verse.ref, surah: verse.surah, ayah: verse.ayah, surahName: verse.surahName });
                  }
                }}
                aria-label={isThisPlaying ? "Pause recitation" : "Play recitation"}
                className={cn("max-md:size-11 max-md:[&_svg]:size-5", currentRef === verse.ref && "border-teal text-teal")}
              >
                <Volume2 />
              </IconButton>
            </Tooltip>
            <Tooltip label={isBookmarked ? "Remove bookmark" : "Bookmark verse"}>
              <IconButton
                size="xs"
                tone="gold"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleBookmark(verse.ref);
                }}
                aria-label={isBookmarked ? "Remove bookmark" : "Bookmark verse"}
                className={cn("max-md:size-11 max-md:[&_svg]:size-5", isBookmarked && "border-gold-muted text-gold")}
              >
                <Heart fill={isBookmarked ? "currentColor" : "none"} />
              </IconButton>
            </Tooltip>
          </div>
        </div>

        <p className="font-arabic text-right text-sm leading-loose text-text-primary">
          {verse.arabicText}
        </p>

        <p className="text-xs leading-relaxed line-clamp-3 text-text-secondary">
          {verse.translation}
        </p>
      </div>

      {/* Expand button */}
      <div
        className="flex justify-center pb-2.5"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <Tooltip label="Expand connections">
          <IconButton
            size="xs"
            tone="teal"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              setOpenExpandNodeId(expandMenuOpen ? null : id);
            }}
            disabled={isExpanding}
            aria-label="Expand connections"
            className={cn("max-md:size-11 max-md:[&_svg]:size-5", expandMenuOpen && "border-teal text-teal")}
          >
            <Plus />
          </IconButton>
        </Tooltip>
      </div>

      {expandMenuOpen && (
        <ExpandMenu
          onSelect={handleExpandSelect}
          onClose={() => setOpenExpandNodeId(null)}
        />
      )}

      {isExpanding && (
        <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-surface-raised/70">
          <Loader2 className="w-4 h-4 animate-spin text-teal" />
        </div>
      )}

      <Handle
        type="source"
        position={Position.Right}
        className="!w-2 !h-2 !bg-border !border-border-subtle"
      />
    </div>
  );
}

export const VerseNode = memo(VerseNodeInner);
