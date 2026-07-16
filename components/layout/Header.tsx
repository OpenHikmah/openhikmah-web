"use client";

import {
  Search,
  RotateCcw,
  Share2,
  ListMusic,
  Maximize2,
  MoreHorizontal,
  Save,
  Image as ImageIcon,
  FileText,
  Loader2,
  Check,
  AlertCircle,
} from "lucide-react";
import { useCanvasStore, serializeCanvas } from "@/store/canvas";
import { useAuthStore } from "@/store/auth";
import { useSocialStore } from "@/store/social";
import { useAudioStore } from "@/store/audio";
import type { AudioVerse } from "@/store/audio";
import type { Verse } from "@/types/quran";
import { buildShareUrl } from "@/hooks/useCanvasPersistence";
import { useState, useEffect, useRef, forwardRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useCopyFeedback } from "@/hooks/useCopyFeedback";
import {
  exportCanvasToPng,
  exportCanvasToPdf,
  downloadDataUrl,
  downloadBlob,
} from "@/lib/canvas/canvas-export";
import { AccountMenu } from "./AccountMenu";
import { Wordmark } from "./Wordmark";
import { HeaderNavLinks } from "./HeaderNavLinks";

interface HeaderProps {
  onSearchOpen: () => void;
}

/** A thumb-sized icon+label button for the mobile bottom action bar (≥56px tap target). */
const BarButton = forwardRef<
  HTMLButtonElement,
  {
    icon: ReactNode;
    label: string;
    onClick: () => void;
    active?: boolean;
    disabled?: boolean;
    danger?: boolean;
  }
>(function BarButton({ icon, label, onClick, active, disabled, danger }, ref) {
  return (
    <button
      ref={ref}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-1 min-h-[58px] px-1 text-[11px] font-medium transition-colors",
        "text-text-secondary [&_svg]:size-[20px] active:bg-white/5 disabled:opacity-40",
        active && "text-teal",
        danger && "text-error"
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
});

const LEGEND_ITEMS: Array<{ label: string; className: string }> = [
  { label: "Theme", className: "bg-theme-edge" },
  { label: "Root", className: "bg-root-edge" },
  { label: "Contrast", className: "bg-contrast-edge" },
];

/** The mobile bar's overflow — export, save (signed-in only), and the edge-color
 * legend, none of which fit as a first-class bottom-bar button on a phone screen. */
function MoreSheet({
  onClose,
  onExport,
  exporting,
  onSave,
  saving,
  saved,
  saveError,
  canSave,
  triggerRef,
}: {
  onClose: () => void;
  onExport: (format: "png" | "pdf") => void;
  exporting: boolean;
  onSave: (() => void) | null;
  saving: boolean;
  saved: boolean;
  saveError: boolean;
  canSave: boolean;
  /** The "More" bar button that opens this sheet — excluded from the outside-click
   *  check, otherwise tapping it to close the sheet immediately reopens it (the
   *  mousedown-driven close runs before the button's own click-toggle handler). */
  triggerRef: React.RefObject<HTMLElement | null>;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        sheetRef.current &&
        !sheetRef.current.contains(target) &&
        !triggerRef.current?.contains(target)
      ) {
        onClose();
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [onClose, triggerRef]);

  return (
    <div
      ref={sheetRef}
      className="fixed inset-x-3 bottom-[calc(58px+env(safe-area-inset-bottom)+8px)] z-50 rounded-lg border border-border bg-surface-overlay shadow-floating md:hidden"
    >
      {onSave && (
        <button
          onClick={onSave}
          disabled={saving || !canSave}
          className="flex w-full items-center gap-2.5 px-4 py-3 text-left disabled:opacity-40"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-text-muted" />
          ) : saved ? (
            <Check className="h-4 w-4 shrink-0 text-teal" />
          ) : saveError ? (
            <AlertCircle className="h-4 w-4 shrink-0 text-error" />
          ) : (
            <Save className="h-4 w-4 shrink-0 text-text-muted" />
          )}
          <span className={cn("text-sm font-medium text-text-primary", saveError && "text-error")}>
            {saving
              ? "Saving…"
              : saved
                ? "Saved"
                : saveError
                  ? "Save failed — try again"
                  : "Save workspace"}
          </span>
        </button>
      )}
      <button
        onClick={() => onExport("png")}
        disabled={exporting}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left disabled:opacity-40"
      >
        <ImageIcon className="h-4 w-4 shrink-0 text-text-muted" />
        <span className="text-sm font-medium text-text-primary">Export as PNG</span>
      </button>
      <button
        onClick={() => onExport("pdf")}
        disabled={exporting}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left disabled:opacity-40"
      >
        <FileText className="h-4 w-4 shrink-0 text-text-muted" />
        <span className="text-sm font-medium text-text-primary">Export as PDF</span>
      </button>
      <div className="flex items-center gap-3 border-t border-border-subtle px-4 py-3">
        {LEGEND_ITEMS.map((item) => (
          <div key={item.label} className="flex items-center gap-1.5">
            <span className={`h-0.5 w-3.5 rounded-full ${item.className}`} />
            <span className="text-[11px] text-text-secondary">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Header({ onSearchOpen }: HeaderProps) {
  const { copied, copy } = useCopyFeedback();
  const [sharing, setSharing] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement>(null);

  const reset = useCanvasStore((s) => s.reset);
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const requestFit = useCanvasStore((s) => s.requestFit);
  const nodeCount = nodes.length;

  const accessToken = useAuthStore((s) => s.accessToken);

  const userId = useSocialStore((s) => s.userId);
  const { bumpStreak, setPendingFriendCount } = useSocialStore();

  const playGraph = useAudioStore((s) => s.playGraph);
  const audioCurrentRef = useAudioStore((s) => s.currentRef);
  const stopAudio = useAudioStore((s) => s.stop);

  // Hydrate streak from server after sign-in
  useEffect(() => {
    if (!accessToken || !userId) return;
    fetch("/api/social/activity", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.streak !== undefined) bumpStreak(data.streak, data.longestStreak);
      })
      .catch((e) => console.error("header: streak hydration failed", e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, userId]);

  // Poll for incoming friend requests every 60 s while signed in
  useEffect(() => {
    if (!accessToken || !userId) return;
    // limit=200 (the pagination max) rather than the default page size: this
    // poll only needs an accurate pending-request count, and defaulting to a
    // small page could undercount for a user with many friends.
    const load = () =>
      fetch("/api/social/friends?limit=200", {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
        .then((r) => (r.ok ? r.json() : { items: [] }))
        .then((data: { items: { status: string; direction: string }[] }) => {
          const count = data.items.filter(
            (f) => f.status === "pending" && f.direction === "received"
          ).length;
          setPendingFriendCount(count);
        })
        .catch((e) => console.error("header: friend-request poll failed", e));
    load();
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, userId]);

  const handlePlayGraph = () => {
    if (audioCurrentRef) {
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

  const handleShare = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const url = await buildShareUrl(serializeCanvas(nodes, edges));
      await copy(url);
    } catch {
      // Share API or clipboard failed — silent on mobile bar
    } finally {
      setSharing(false);
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
      setMoreOpen(false);
    } catch {
      setExportError(true);
      setTimeout(() => setExportError(false), 2500);
    } finally {
      setExporting(false);
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
        setTimeout(() => {
          setSaved(false);
          setMoreOpen(false);
        }, 1200);
      } else {
        setSaveError(true);
        setTimeout(() => setSaveError(false), 2500);
      }
    } catch {
      setSaveError(true);
      setTimeout(() => setSaveError(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <header className="flex items-center justify-between px-6 md:px-12 h-[60px] shrink-0 bg-bg border-b border-border">
        <div className="flex items-center h-full gap-6">
          <Wordmark />
          <HeaderNavLinks />
        </div>
        <AccountMenu />
      </header>

      {/* Mobile: bottom action bar — primary canvas actions (<md, only with nodes) */}
      {nodeCount > 0 && (
        <>
          {moreOpen && (
            <MoreSheet
              onClose={() => setMoreOpen(false)}
              onExport={handleExport}
              exporting={exporting}
              onSave={accessToken ? handleSave : null}
              saving={saving}
              saved={saved}
              saveError={saveError}
              canSave={nodes.length > 0}
              triggerRef={moreButtonRef}
            />
          )}
          <div className="fixed inset-x-0 bottom-0 z-40 flex md:hidden bg-surface/95 backdrop-blur border-t border-border pb-[env(safe-area-inset-bottom)]">
            <BarButton icon={<Search />} label="Search" onClick={onSearchOpen} />
            <BarButton icon={<Maximize2 />} label="Fit" onClick={requestFit} />
            <BarButton
              icon={<ListMusic />}
              label={audioCurrentRef ? "Stop" : "Play all"}
              onClick={handlePlayGraph}
              active={!!audioCurrentRef}
            />
            <BarButton
              icon={<Share2 />}
              label={sharing ? "…" : copied ? "Copied" : "Share"}
              onClick={handleShare}
              disabled={sharing}
              active={copied}
            />
            <BarButton
              ref={moreButtonRef}
              icon={exportError ? <RotateCcw /> : <MoreHorizontal />}
              label={exportError ? "Failed" : "More"}
              onClick={() => setMoreOpen((v) => !v)}
              active={moreOpen}
            />
            <BarButton icon={<RotateCcw />} label="Clear" onClick={reset} danger />
          </div>
        </>
      )}
    </>
  );
}
