"use client";

import { memo } from "react";
import { Handle, Position, useReactFlow, type NodeProps } from "@xyflow/react";
import { useTranslations } from "next-intl";
import { useShallow } from "zustand/shallow";
import type { Verse, EdgeKind } from "@/types/quran";
import { useCanvasStore, selectFocus } from "@/store/canvas";
import { useAuthStore } from "@/store/auth";
import { usePreferencesStore } from "@/store/preferences";
import { cn } from "@/lib/utils";
import { Plus, Heart, Volume2, Copy } from "lucide-react";
import { IconButton, Tooltip } from "@/components/ui";
import { ExpandMenu } from "./ExpandMenu";
import { useAudioStore } from "@/store/audio";
import { NODE_WIDTH, NODE_HEIGHT } from "@/lib/canvas/canvas-layout";

type VerseNodeData = Verse & { isRoot?: boolean; isLoading?: boolean };

export const KIND_COLOR_VAR: Record<EdgeKind, string> = {
  thematic: "var(--color-teal-bright)",
  root: "var(--color-gold)",
  contrast: "var(--color-contrast-edge)",
};

type FocusState = "none" | "selected" | "paired" | "in" | "dim";

function VerseNodeInner({ id, data }: NodeProps) {
  const verse = data as unknown as VerseNodeData;
  const t = useTranslations("canvas");
  const tCommon = useTranslations("common");

  // Narrowed to booleans/strings (not the raw shared fields) so a change only
  // re-renders the card it actually affects, not every card on the canvas.
  const expandingKind = useCanvasStore((s) => (s.expandingNodeId === id ? s.expandingKind : null));
  const isExpanding = useCanvasStore((s) => s.expandingNodeId === id);
  const anyExpanding = useCanvasStore((s) => s.expandingNodeId !== null);
  const expandMenuOpen = useCanvasStore((s) => s.openExpandNodeId === id);
  const isPulsing = useCanvasStore((s) => s.newlyAddedNodeId === id);
  const focus = useCanvasStore((s): FocusState => {
    const f = selectFocus(s);
    if (!f) return "none";
    if (f.selected === id) return "selected";
    if (f.paired.has(id)) return "paired";
    return f.nodes.has(id) ? "in" : "dim";
  });
  const isHovered = useCanvasStore((s) => {
    const e = s.hoveredEdgeId ? s.edges.find((x) => x.id === s.hoveredEdgeId) : undefined;
    return !!e && (e.source === id || e.target === id);
  });
  const sidebarIsThisNode = useCanvasStore(
    (s) => s.sidebarContent?.type === "node" && s.sidebarContent.nodeId === id
  );
  const setOpenExpandNodeId = useCanvasStore((s) => s.setOpenExpandNodeId);
  const setSidebarContent = useCanvasStore((s) => s.setSidebarContent);
  const setPendingExpand = useCanvasStore((s) => s.setPendingExpand);
  const setNewlyAddedNode = useCanvasStore((s) => s.setNewlyAddedNode);
  const getNodeById = useCanvasStore((s) => s.getNodeById);
  // Subscribed directly to the derived map (not through getDuplicateNodeIds, a
  // stable function reference that never changes identity). useShallow bails the
  // re-render when the recomputed array has the same contents as before.
  const otherDuplicateIds = useCanvasStore(
    useShallow((s) => (s.duplicateNodeIdsByRef[verse.ref] ?? []).filter((did) => did !== id))
  );
  const showArabic = usePreferencesStore((s) => s.canvasPrefs.showArabic);
  const reactFlow = useReactFlow();

  const isBookmarked = useAuthStore((s) => s.isBookmarked(verse.ref));
  const toggleBookmark = useAuthStore((s) => s.toggleBookmark);

  const playVerse = useAudioStore((s) => s.playVerse);
  const currentRef = useAudioStore((s) => s.currentRef);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const pauseAudio = useAudioStore((s) => s.pause);
  const resumeAudio = useAudioStore((s) => s.resume);
  const isThisPlaying = currentRef === verse.ref && isPlaying;

  const hasDuplicate = otherDuplicateIds.length > 0;

  const handleExpandSelect = (kind: EdgeKind) => {
    setPendingExpand({ nodeId: id, ref: verse.ref, kind });
  };

  const jumpToDuplicate = (e: React.MouseEvent) => {
    e.stopPropagation();
    const targetId = otherDuplicateIds[0];
    const targetNode = getNodeById(targetId);
    if (!targetNode) return;
    reactFlow.setCenter(
      targetNode.position.x + NODE_WIDTH / 2,
      targetNode.position.y + NODE_HEIGHT / 2,
      { zoom: reactFlow.getZoom(), duration: 400 }
    );
    setNewlyAddedNode(targetId);
  };

  const toggleThread = () => {
    setSidebarContent(sidebarIsThisNode ? null : { type: "node", nodeId: id });
  };

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={focus === "selected" || focus === "paired"}
      aria-label={`${verse.surahName} ${verse.ref}`}
      data-expand-open={expandMenuOpen || undefined}
      onClick={toggleThread}
      onKeyDown={(e) => {
        // Bubbled keydowns from nested buttons must not also toggle the card.
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggleThread();
        }
      }}
      style={
        expandingKind
          ? ({ "--kc": KIND_COLOR_VAR[expandingKind] } as React.CSSProperties)
          : undefined
      }
      className={cn(
        "relative w-72 cursor-pointer select-none overflow-visible rounded-[10px] border bg-surface-raised node-entrance",
        "transition-[opacity,border-color] duration-200 ease-[cubic-bezier(0.2,0,0,1)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        focus === "selected"
          ? "border-gold"
          : focus === "paired" || isHovered
            ? "border-teal/70"
            : "border-border hover:border-text-muted",
        focus === "dim" && !isHovered && "opacity-30",
        isExpanding && "node-expanding",
        isPulsing && "node-pulse"
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={false}
        className="!pointer-events-none !opacity-0"
      />

      {hasDuplicate && (
        <Tooltip label={t("duplicateTooltip")}>
          <button
            type="button"
            onMouseDown={stop}
            onClick={jumpToDuplicate}
            aria-label={t("jumpToDuplicate")}
            className="absolute -top-2 -left-2 z-10 flex h-5 w-5 items-center justify-center rounded-full border border-gold bg-surface-raised text-gold shadow-sm transition-colors hover:bg-gold/10"
          >
            <Copy className="h-3 w-3" />
          </button>
        </Tooltip>
      )}

      <div className="flex items-center gap-1.5 px-3 pt-3">
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-text-muted">
          {verse.surahName}
        </span>
        <span
          className={cn(
            "shrink-0 rounded border px-1.5 py-0.5 font-mono text-xs",
            verse.isRoot ? "border-gold bg-gold/10 text-gold" : "border-border text-text-muted"
          )}
        >
          {verse.ref}
        </span>
        <Tooltip label={isThisPlaying ? t("pauseRecitation") : t("playRecitation")}>
          <IconButton
            size="xs"
            tone="teal"
            onMouseDown={stop}
            onClick={(e) => {
              e.stopPropagation();
              if (isThisPlaying) pauseAudio();
              else if (currentRef === verse.ref) resumeAudio();
              else
                playVerse({
                  ref: verse.ref,
                  surah: verse.surah,
                  ayah: verse.ayah,
                  surahName: verse.surahName,
                });
            }}
            aria-label={isThisPlaying ? t("pauseRecitation") : t("playRecitation")}
            className={cn(
              "max-md:size-11 max-md:[&_svg]:size-5",
              currentRef === verse.ref && "border-teal text-teal"
            )}
          >
            <Volume2 />
          </IconButton>
        </Tooltip>
        <Tooltip label={isBookmarked ? tCommon("removeBookmark") : tCommon("bookmarkVerse")}>
          <IconButton
            size="xs"
            tone="gold"
            onMouseDown={stop}
            onClick={(e) => {
              e.stopPropagation();
              toggleBookmark(verse.ref);
            }}
            aria-label={isBookmarked ? tCommon("removeBookmark") : tCommon("bookmarkVerse")}
            className={cn(
              "max-md:size-11 max-md:[&_svg]:size-5",
              isBookmarked && "border-gold-muted text-gold"
            )}
          >
            <Heart fill={isBookmarked ? "currentColor" : "none"} />
          </IconButton>
        </Tooltip>
      </div>

      {showArabic && (
        <p
          lang="ar"
          dir="rtl"
          className="line-clamp-3 px-3 pt-2 text-right font-arabic text-sm leading-loose text-text-secondary"
        >
          {verse.arabicText}
        </p>
      )}

      <p className="line-clamp-4 px-3 pt-1.5 text-[13.5px] leading-[1.55] text-text-primary">
        {verse.translation}
      </p>

      <div className="flex items-center justify-between gap-2 px-3 pt-2.5 pb-3">
        {expandingKind ? (
          <span role="status" className="font-mono text-[11.5px] text-[color:var(--kc)]">
            {t("findingVerses", { kind: t(`kindWord.${expandingKind}`) })}
          </span>
        ) : (
          <span />
        )}
        <div onMouseDown={stop} onClick={stop}>
          <Tooltip label={t("findLinkedVerses")}>
            <IconButton
              size="xs"
              tone="teal"
              onMouseDown={stop}
              onClick={(e) => {
                e.stopPropagation();
                setOpenExpandNodeId(expandMenuOpen ? null : id);
              }}
              disabled={anyExpanding}
              aria-label={t("findLinkedVerses")}
              aria-haspopup="menu"
              aria-expanded={expandMenuOpen}
              className={cn(
                "max-md:size-11 max-md:[&_svg]:size-5",
                expandMenuOpen && "border-teal text-teal"
              )}
            >
              <Plus />
            </IconButton>
          </Tooltip>
        </div>
      </div>

      {expandMenuOpen && (
        <ExpandMenu
          verseRef={verse.ref}
          onSelect={handleExpandSelect}
          onClose={() => setOpenExpandNodeId(null)}
        />
      )}

      <Handle
        type="source"
        position={Position.Right}
        isConnectable={false}
        className="!pointer-events-none !opacity-0"
      />
    </div>
  );
}

export const VerseNode = memo(VerseNodeInner);
