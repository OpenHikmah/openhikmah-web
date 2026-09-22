"use client";

import { useEffect } from "react";
import { useAudioStore } from "@/store/audio";
import { Play, Pause, SkipBack, SkipForward, X, Loader2, Volume2 } from "lucide-react";
import { IconButton } from "@/components/ui";
import { useMobileNavVisible } from "@/hooks/useMobileNavVisible";
import { cn } from "@/lib/utils";

const SPACE_PASSTHROUGH =
  "input, textarea, select, button, a, [role=button], [contenteditable=true], .react-flow";

export function MiniPlayer() {
  const {
    currentRef,
    currentSurahName,
    isPlaying,
    isLoading,
    queue,
    queueIndex,
    pause,
    resume,
    stop,
    next,
    prev,
  } = useAudioStore();
  const mobileNavVisible = useMobileNavVisible();

  useEffect(() => {
    if (!currentRef) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      // Leave Space its native meaning: typing, activating a focused control,
      // and React Flow's hold-Space-to-pan on the canvas.
      const target = e.target as HTMLElement;
      if (target.closest(SPACE_PASSTHROUGH)) return;
      e.preventDefault();
      const s = useAudioStore.getState();
      if (s.isLoading) return;
      if (s.isPlaying) s.pause();
      else s.resume();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [currentRef]);

  if (!currentRef) return null;

  const hasNext = queueIndex < queue.length - 1;
  const hasPrev = queueIndex > 0;
  const queueLabel = queue.length > 1 ? ` (${queueIndex + 1}/${queue.length})` : "";

  return (
    <div
      className={cn(
        "fixed bottom-4 left-1/2 z-50 flex min-w-[280px] -translate-x-1/2 items-center gap-3 rounded-xl border border-border bg-surface-raised px-4 py-2.5 shadow-floating",
        // MobileNavBar (md:hidden, min-h-[58px] + safe-area inset) sits on the
        // bottom edge below md — offset above it instead of overlapping.
        mobileNavVisible && "max-md:bottom-[calc(58px+env(safe-area-inset-bottom)+16px)]"
      )}
    >
      {/* Icon */}
      <Volume2 className="h-3.5 w-3.5 shrink-0 text-teal" />

      {/* Track info */}
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-xs text-text-primary">
          {currentRef}
          <span className="text-text-muted">{queueLabel}</span>
        </p>
        {currentSurahName && (
          <p className="truncate text-[10px] text-text-muted">{currentSurahName}</p>
        )}
      </div>

      {/* Controls */}
      <div className="flex shrink-0 items-center gap-1">
        {hasPrev && (
          <IconButton
            tone="teal"
            size="xs"
            onClick={prev}
            aria-label="Previous verse"
            className="border-transparent"
          >
            <SkipBack />
          </IconButton>
        )}

        <IconButton
          tone="teal"
          size="sm"
          onClick={isPlaying ? pause : resume}
          aria-label={isPlaying ? "Pause" : "Play"}
          disabled={isLoading}
          className="border-teal text-teal"
        >
          {isLoading ? <Loader2 className="animate-spin" /> : isPlaying ? <Pause /> : <Play />}
        </IconButton>

        {hasNext && (
          <IconButton
            tone="teal"
            size="xs"
            onClick={next}
            aria-label="Next verse"
            className="border-transparent"
          >
            <SkipForward />
          </IconButton>
        )}

        <IconButton
          tone="danger"
          size="xs"
          onClick={stop}
          aria-label="Stop playback"
          className="ml-1 border-transparent"
        >
          <X />
        </IconButton>
      </div>
    </div>
  );
}
