"use client";

import { useState } from "react";
import { Share2, Save, Maximize2, RotateCcw, ListMusic, Loader2, Check, AlertCircle } from "lucide-react";
import { Panel, useReactFlow } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { useCanvasStore, serializeCanvas } from "@/store/canvas";
import { useAuthStore } from "@/store/auth";
import { useAudioStore } from "@/store/audio";
import { useCopyFeedback } from "@/hooks/useCopyFeedback";
import { buildShareUrl } from "@/hooks/useCanvasPersistence";
import type { AudioVerse } from "@/store/audio";
import type { Verse } from "@/types/quran";

function ToolbarBtn({
  onClick,
  disabled,
  danger,
  active,
  children,
  className,
}: {
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  active?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-wait disabled:opacity-50",
        "text-text-secondary hover:bg-white/8 hover:text-text-primary",
        active && "text-teal",
        danger && "text-error hover:bg-error/[0.07] hover:text-error",
        className
      )}
    >
      {children}
    </button>
  );
}

const divider = <span className="mx-0.5 h-4 w-px shrink-0 bg-border" />;

export function CanvasToolbar() {
  const reactFlow = useReactFlow();
  const { copied, copy } = useCopyFeedback();

  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const reset = useCanvasStore((s) => s.reset);

  const accessToken = useAuthStore((s) => s.accessToken);

  const playGraph = useAudioStore((s) => s.playGraph);
  const currentRef = useAudioStore((s) => s.currentRef);
  const stopAudio = useAudioStore((s) => s.stop);

  const handleShare = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const url = await buildShareUrl(serializeCanvas(nodes, edges));
      await copy(url);
    } catch {
      setShareError(true);
      setTimeout(() => setShareError(false), 2500);
    } finally {
      setSharing(false);
    }
  };

  const handleSave = async () => {
    if (saving || !accessToken || nodes.length === 0) return;
    setSaving(true);
    try {
      const count = nodes.length;
      const date = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const name = `${count} verse${count === 1 ? "" : "s"} — ${date}`;
      const res = await fetch("/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ name, data: serializeCanvas(nodes, edges), nodeCount: count }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        setSaveError(true);
        setTimeout(() => setSaveError(false), 2000);
      }
    } catch {
      setSaveError(true);
      setTimeout(() => setSaveError(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const handlePlay = () => {
    if (currentRef) { stopAudio(); return; }
    const verses: AudioVerse[] = [...nodes]
      .map((n) => n.data as unknown as Verse)
      .filter((v) => v?.surah && v?.ayah)
      .sort((a, b) => a.surah !== b.surah ? a.surah - b.surah : a.ayah - b.ayah)
      .map((v) => ({ ref: v.ref, surah: v.surah, ayah: v.ayah, surahName: v.surahName }));
    if (verses.length > 0) playGraph(verses);
  };

  return (
    <Panel position="top-center" className="hidden md:block">
      <div className="flex items-center gap-0.5 rounded-xl border border-border bg-surface/90 px-2 py-1.5 shadow-floating backdrop-blur-sm">
        <ToolbarBtn
          onClick={handleShare}
          disabled={sharing}
          active={copied}
          className={shareError ? "text-error" : undefined}
        >
          {sharing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : copied ? (
            <Check className="h-3.5 w-3.5" />
          ) : shareError ? (
            <AlertCircle className="h-3.5 w-3.5" />
          ) : (
            <Share2 className="h-3.5 w-3.5" />
          )}
          {copied ? "Copied" : shareError ? "Failed" : "Share"}
        </ToolbarBtn>

        {accessToken && (
          <ToolbarBtn
            onClick={handleSave}
            disabled={saving}
            active={saved}
            className={saveError ? "text-error" : undefined}
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : saved ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {saving ? "Saving…" : saved ? "Saved" : saveError ? "Failed" : "Save"}
          </ToolbarBtn>
        )}

        <ToolbarBtn onClick={() => reactFlow.fitView({ padding: 0.35, maxZoom: 1, duration: 400 })}>
          <Maximize2 className="h-3.5 w-3.5" />
          Fit
        </ToolbarBtn>

        <ToolbarBtn onClick={handlePlay} active={!!currentRef}>
          <ListMusic className="h-3.5 w-3.5" />
          {currentRef ? "Stop" : "Play"}
        </ToolbarBtn>

        {divider}

        <ToolbarBtn onClick={reset} danger>
          <RotateCcw className="h-3.5 w-3.5" />
          Clear
        </ToolbarBtn>
      </div>
    </Panel>
  );
}
