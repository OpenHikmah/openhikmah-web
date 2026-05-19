"use client";

import { useAudioStore } from "@/store/audio";
import { Play, Pause, SkipBack, SkipForward, X, Loader2, Volume2 } from "lucide-react";

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

  if (!currentRef) return null;

  const hasNext = queueIndex < queue.length - 1;
  const hasPrev = queueIndex > 0;
  const queueLabel = queue.length > 1 ? ` (${queueIndex + 1}/${queue.length})` : "";

  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2.5 rounded-xl shadow-xl"
      style={{
        background: "var(--color-surface-raised)",
        border: "1px solid var(--color-border)",
        minWidth: 280,
      }}
    >
      {/* Icon */}
      <Volume2
        className="w-3.5 h-3.5 shrink-0"
        style={{ color: "var(--color-teal)" }}
      />

      {/* Track info */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-mono truncate" style={{ color: "var(--color-text-primary)" }}>
          {currentRef}
          <span style={{ color: "var(--color-text-muted)" }}>{queueLabel}</span>
        </p>
        {currentSurahName && (
          <p className="text-[10px] truncate" style={{ color: "var(--color-text-muted)" }}>
            {currentSurahName}
          </p>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-1 shrink-0">
        {hasPrev && (
          <button
            onClick={prev}
            aria-label="Previous verse"
            className="w-6 h-6 flex items-center justify-center rounded transition-colors cursor-pointer hover:text-[var(--color-teal)]"
            style={{ color: "var(--color-text-muted)" }}
          >
            <SkipBack className="w-3.5 h-3.5" />
          </button>
        )}

        <button
          onClick={isPlaying ? pause : resume}
          aria-label={isPlaying ? "Pause" : "Play"}
          disabled={isLoading}
          className="w-7 h-7 flex items-center justify-center rounded border transition-colors cursor-pointer disabled:opacity-50"
          style={{
            borderColor: "var(--color-teal)",
            color: "var(--color-teal)",
          }}
        >
          {isLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : isPlaying ? (
            <Pause className="w-3.5 h-3.5" />
          ) : (
            <Play className="w-3.5 h-3.5" />
          )}
        </button>

        {hasNext && (
          <button
            onClick={next}
            aria-label="Next verse"
            className="w-6 h-6 flex items-center justify-center rounded transition-colors cursor-pointer hover:text-[var(--color-teal)]"
            style={{ color: "var(--color-text-muted)" }}
          >
            <SkipForward className="w-3.5 h-3.5" />
          </button>
        )}

        <button
          onClick={stop}
          aria-label="Stop playback"
          className="w-6 h-6 flex items-center justify-center rounded transition-colors cursor-pointer hover:text-red-400 ml-1"
          style={{ color: "var(--color-text-muted)" }}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
