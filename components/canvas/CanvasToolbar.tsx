"use client";

import { useEffect, useRef, useState } from "react";
import {
  Search,
  Share2,
  Save,
  Maximize2,
  RotateCcw,
  ListMusic,
  Loader2,
  Check,
  AlertCircle,
  LogIn,
  Download,
} from "lucide-react";
import { Panel, useReactFlow } from "@xyflow/react";
import { useTranslations, useFormatter } from "next-intl";
import { cn } from "@/lib/utils";
import { useCanvasStore, serializeCanvas } from "@/store/canvas";
import { useAuthStore } from "@/store/auth";
import { useAudioStore } from "@/store/audio";
import { useCopyFeedback } from "@/hooks/useCopyFeedback";
import { useArmedConfirm } from "@/hooks/useArmedConfirm";
import { useSignIn } from "@/hooks/useSignIn";
import { buildShareUrl } from "@/hooks/useCanvasPersistence";
import {
  exportCanvasToPng,
  exportCanvasToPdf,
  downloadDataUrl,
  downloadBlob,
} from "@/lib/canvas/canvas-export";
import { ExportMenu } from "./ExportMenu";
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
        "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-[color,background-color,transform] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.97] disabled:cursor-wait disabled:opacity-50",
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

export function CanvasToolbar({ onSearchOpen }: { onSearchOpen: () => void }) {
  const t = useTranslations("canvas");
  const format = useFormatter();
  const reactFlow = useReactFlow();
  const { copied, copy } = useCopyFeedback();

  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const { signIn: handleSignIn, signingIn } = useSignIn();
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(false);
  const exportContainerRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(true);
  const shareTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exportTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // CanvasToolbar unmounts whenever nodes.length hits 0 (e.g. select-all +
  // delete while a save/share/export request is still in flight) — clear any
  // pending feedback-reset timeout and stop setting state after that point.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (shareTimeoutRef.current) clearTimeout(shareTimeoutRef.current);
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (exportTimeoutRef.current) clearTimeout(exportTimeoutRef.current);
    };
  }, []);

  // Close on any click outside the export button/menu — panning the canvas,
  // clicking a node, or clicking the minimap would otherwise leave it open
  // (ReactFlow's onPaneClick only resets node-expansion state, not this).
  // Mirrors the outside-click handling in components/layout/AccountMenu.tsx.
  useEffect(() => {
    if (!exportMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (exportContainerRef.current && !exportContainerRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [exportMenuOpen]);

  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const reset = useCanvasStore((s) => s.reset);
  const { armed: clearArmed, trigger: triggerClear } = useArmedConfirm(reset);

  const accessToken = useAuthStore((s) => s.accessToken);

  const playGraph = useAudioStore((s) => s.playGraph);
  const currentRef = useAudioStore((s) => s.currentRef);
  const stopAudio = useAudioStore((s) => s.stop);

  const handleShare = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const url = await buildShareUrl(serializeCanvas(nodes, edges));
      if (!mountedRef.current) return;
      await copy(url);
    } catch {
      if (!mountedRef.current) return;
      setShareError(true);
      if (shareTimeoutRef.current) clearTimeout(shareTimeoutRef.current);
      shareTimeoutRef.current = setTimeout(() => {
        if (mountedRef.current) setShareError(false);
      }, 2500);
    } finally {
      if (mountedRef.current) setSharing(false);
    }
  };

  const handleSave = async () => {
    if (saving || !accessToken || nodes.length === 0) return;
    setSaving(true);
    try {
      const count = nodes.length;
      const date = format.dateTime(new Date(), { month: "short", day: "numeric" });
      const name = t("workspaceName", { count, date });
      const res = await fetch("/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ name, data: serializeCanvas(nodes, edges), nodeCount: count }),
      });
      if (!mountedRef.current) return;
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (res.ok) {
        setSaved(true);
        saveTimeoutRef.current = setTimeout(() => {
          if (mountedRef.current) setSaved(false);
        }, 2000);
      } else {
        setSaveError(true);
        saveTimeoutRef.current = setTimeout(() => {
          if (mountedRef.current) setSaveError(false);
        }, 2000);
      }
    } catch {
      if (!mountedRef.current) return;
      setSaveError(true);
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        if (mountedRef.current) setSaveError(false);
      }, 2000);
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  };

  const handleExport = async (format: "png" | "pdf") => {
    if (exporting) return;
    setExporting(true);
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      if (format === "png") {
        const dataUrl = await exportCanvasToPng(nodes);
        downloadDataUrl(dataUrl, `hikmah-canvas-${stamp}.png`);
      } else {
        const blob = await exportCanvasToPdf(nodes);
        downloadBlob(blob, `hikmah-canvas-${stamp}.pdf`);
      }
    } catch {
      if (!mountedRef.current) return;
      setExportError(true);
      if (exportTimeoutRef.current) clearTimeout(exportTimeoutRef.current);
      exportTimeoutRef.current = setTimeout(() => {
        if (mountedRef.current) setExportError(false);
      }, 2500);
    } finally {
      if (mountedRef.current) setExporting(false);
    }
  };

  const handlePlay = () => {
    if (currentRef) {
      stopAudio();
      return;
    }
    const verses: AudioVerse[] = [...nodes]
      .map((n) => n.data as unknown as Verse)
      .filter((v) => v?.surah && v?.ayah)
      .sort((a, b) => (a.surah !== b.surah ? a.surah - b.surah : a.ayah - b.ayah))
      .map((v) => ({ ref: v.ref, surah: v.surah, ayah: v.ayah, surahName: v.surahName }));
    if (verses.length > 0) playGraph(verses);
  };

  return (
    <Panel position="top-center" className="hidden md:block">
      <div className="flex items-center gap-0.5 rounded-xl border border-border bg-surface/90 px-2 py-1.5 shadow-floating backdrop-blur-sm">
        {/* Creation: the primary action, in the brand accent. Mirrors the empty
            state's centred search so verses can still be added once the canvas
            is populated (the global header search was removed). See issue #75. */}
        <ToolbarBtn onClick={onSearchOpen} className="text-gold hover:bg-gold/10 hover:text-gold">
          <Search className="h-3.5 w-3.5" />
          {t("toolbarSearch")}
          <kbd className="ml-0.5 rounded bg-gold/10 px-1 font-mono text-[10px] text-text-muted">
            ⌘K
          </kbd>
        </ToolbarBtn>

        {divider}

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
          {copied ? t("copied") : shareError ? t("shareFailed") : t("share")}
        </ToolbarBtn>

        {accessToken ? (
          <ToolbarBtn
            onClick={handleSave}
            disabled={saving || nodes.length === 0}
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
            {saving ? t("saving") : saved ? t("saved") : saveError ? t("saveFailed") : t("save")}
          </ToolbarBtn>
        ) : (
          // Don't silently hide Save when signed out — offer the way to enable it.
          <ToolbarBtn onClick={handleSignIn} disabled={signingIn}>
            {signingIn ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <LogIn className="h-3.5 w-3.5" />
            )}
            {t("signInToSave")}
          </ToolbarBtn>
        )}

        <div className="relative" ref={exportContainerRef}>
          <ToolbarBtn
            onClick={() => setExportMenuOpen((v) => !v)}
            disabled={exporting || nodes.length === 0}
            active={exportMenuOpen}
            className={exportError ? "text-error" : undefined}
          >
            {exporting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : exportError ? (
              <AlertCircle className="h-3.5 w-3.5" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            {exporting ? t("exporting") : exportError ? t("exportFailed") : t("export")}
          </ToolbarBtn>
          {exportMenuOpen && (
            <ExportMenu onSelect={handleExport} onClose={() => setExportMenuOpen(false)} />
          )}
        </div>

        <ToolbarBtn onClick={() => reactFlow.fitView({ padding: 0.35, maxZoom: 1, duration: 400 })}>
          <Maximize2 className="h-3.5 w-3.5" />
          {t("fit")}
        </ToolbarBtn>

        <ToolbarBtn onClick={handlePlay} active={!!currentRef}>
          <ListMusic className="h-3.5 w-3.5" />
          {currentRef ? t("stop") : t("play")}
        </ToolbarBtn>

        {divider}

        <ToolbarBtn onClick={triggerClear} danger>
          <RotateCcw className="h-3.5 w-3.5" />
          {clearArmed ? t("clearConfirm") : t("clear")}
        </ToolbarBtn>
      </div>
    </Panel>
  );
}
