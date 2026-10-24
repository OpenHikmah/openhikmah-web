"use client";

import { useEffect, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import {
  Search,
  Share2,
  Save,
  Headphones,
  Loader2,
  Check,
  AlertCircle,
  LogIn,
  Image as ImageIcon,
  FileText,
  Trash2,
  MoreHorizontal,
} from "lucide-react";
import { Panel } from "@xyflow/react";
import { useTranslations, useFormatter } from "next-intl";
import { cn } from "@/lib/utils";
import { useCanvasStore, serializeCanvas, isPlaceholderNode } from "@/store/canvas";
import { useAuthStore } from "@/store/auth";
import { useAudioStore } from "@/store/audio";
import { useCopyFeedback } from "@/hooks/useCopyFeedback";
import { useSignIn } from "@/hooks/useSignIn";
import { buildShareUrl } from "@/hooks/useCanvasPersistence";
import {
  exportCanvasToPng,
  exportCanvasToPdf,
  downloadDataUrl,
  downloadBlob,
} from "@/lib/canvas/canvas-export";
import type { AudioVerse } from "@/store/audio";
import type { Verse } from "@/types/quran";
import { authFetch } from "@/lib/auth/auth-fetch";

function ToolbarBtn({
  onClick,
  disabled,
  active,
  children,
  className,
  ...rest
}: {
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  children: React.ReactNode;
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-[color,background-color,transform] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.97] disabled:cursor-wait disabled:opacity-50",
        "text-text-secondary hover:bg-white/8 hover:text-text-primary",
        active && "text-teal-bright",
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

const MENU_ITEM =
  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-text-primary transition-colors hover:bg-white/5 disabled:opacity-50 [&_svg]:size-3.5 [&_svg]:text-text-secondary";

type Status = { text: string; tone: "ok" | "error" | "busy" } | null;

export function CanvasToolbar({ onSearchOpen }: { onSearchOpen: () => void }) {
  const t = useTranslations("canvas");
  const format = useFormatter();
  const { copied, copy } = useCopyFeedback();

  const [sharing, setSharing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [shareError, setShareError] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const { signIn: handleSignIn, signingIn } = useSignIn();
  const mountedRef = useRef(true);
  const shareTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // CanvasToolbar unmounts whenever the canvas empties (e.g. Clear while a
  // save/share/export request is still in flight) — clear any pending
  // feedback-reset timeout and stop setting state after that point.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (shareTimeoutRef.current) clearTimeout(shareTimeoutRef.current);
      if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);
    };
  }, []);

  const flashStatus = (next: Status, ms = 2500) => {
    if (!mountedRef.current) return;
    setStatus(next);
    if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);
    if (next && next.tone !== "busy") {
      statusTimeoutRef.current = setTimeout(() => {
        if (mountedRef.current) setStatus(null);
      }, ms);
    }
  };

  const allNodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const clearCanvas = useCanvasStore((s) => s.clearCanvas);
  const nodes = allNodes.filter((n) => !isPlaceholderNode(n));

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
    // Each accepted POST creates a new saved canvas, so one save at a time.
    if (saving || !accessToken || nodes.length === 0) return;
    setSaving(true);
    flashStatus({ text: t("saving"), tone: "busy" });
    try {
      const count = nodes.length;
      const date = format.dateTime(new Date(), { month: "short", day: "numeric" });
      const name = t("workspaceName", { count, date });
      const res = await authFetch("/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, data: serializeCanvas(nodes, edges), nodeCount: count }),
      });
      flashStatus(
        res.ok ? { text: t("saved"), tone: "ok" } : { text: t("saveFailedRetry"), tone: "error" }
      );
    } catch {
      flashStatus({ text: t("saveFailedRetry"), tone: "error" });
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  };

  const handleExport = async (kind: "png" | "pdf") => {
    if (nodes.length === 0) return;
    flashStatus({ text: t("exporting"), tone: "busy" });
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      if (kind === "png") {
        const dataUrl = await exportCanvasToPng(nodes);
        downloadDataUrl(dataUrl, `hikmah-canvas-${stamp}.png`);
      } else {
        const blob = await exportCanvasToPdf(nodes);
        downloadBlob(blob, `hikmah-canvas-${stamp}.pdf`);
      }
      flashStatus(null);
    } catch {
      flashStatus({ text: t("exportFailed"), tone: "error" });
    }
  };

  const handleListen = () => {
    if (currentRef) {
      stopAudio();
      return;
    }
    const verses: AudioVerse[] = nodes
      .map((n) => n.data as unknown as Verse)
      .filter((v) => v?.surah && v?.ayah)
      .sort((a, b) => (a.surah !== b.surah ? a.surah - b.surah : a.ayah - b.ayah))
      .map((v) => ({ ref: v.ref, surah: v.surah, ayah: v.ayah, surahName: v.surahName }));
    if (verses.length > 0) playGraph(verses);
  };

  const runFromMenu = (fn: () => void) => {
    setMoreOpen(false);
    fn();
  };

  return (
    <Panel position="top-center" className="hidden md:block">
      <div className="flex items-center gap-0.5 rounded-xl border border-border bg-surface/90 px-1.5 py-1.5 shadow-floating backdrop-blur-sm">
        {/* Creation: the primary action, in the brand accent. */}
        <ToolbarBtn onClick={onSearchOpen} className="text-gold hover:bg-gold/10 hover:text-gold">
          <Search className="h-3.5 w-3.5" />
          {t("toolbarSearch")}
          <kbd className="ml-0.5 rounded bg-gold/10 px-1 font-mono text-[10px] text-text-muted">
            ⌘K
          </kbd>
        </ToolbarBtn>

        <span className="mx-0.5 h-4 w-px shrink-0 bg-border" />

        <ToolbarBtn onClick={handleListen} active={!!currentRef} aria-pressed={!!currentRef}>
          <Headphones className="h-3.5 w-3.5" />
          {currentRef ? t("stop") : t("listen")}
        </ToolbarBtn>

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
          {copied ? t("linkCopied") : shareError ? t("shareFailed") : t("share")}
        </ToolbarBtn>

        <Popover.Root open={moreOpen} onOpenChange={setMoreOpen}>
          <Popover.Trigger asChild>
            <ToolbarBtn
              aria-label={t("more")}
              className="px-2 data-[state=open]:bg-white/8 data-[state=open]:text-text-primary"
            >
              <MoreHorizontal className="h-4 w-4" />
            </ToolbarBtn>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              align="end"
              sideOffset={10}
              className="z-50 flex min-w-56 flex-col rounded-xl border border-border bg-surface-overlay p-1.5 shadow-floating"
            >
              {accessToken ? (
                <button
                  type="button"
                  className={MENU_ITEM}
                  disabled={saving}
                  onClick={() => runFromMenu(handleSave)}
                >
                  <Save />
                  {t("saveToCanvases")}
                </button>
              ) : (
                // Don't hide Save when signed out — offer the way to enable it. The
                // canvas is kept in localStorage, so it is still here after sign-in.
                <button
                  type="button"
                  className={MENU_ITEM}
                  disabled={signingIn}
                  onClick={() => runFromMenu(handleSignIn)}
                >
                  <LogIn />
                  {t("signInToSave")}
                </button>
              )}
              <button
                type="button"
                className={MENU_ITEM}
                onClick={() => runFromMenu(() => handleExport("png"))}
              >
                <ImageIcon />
                {t("downloadImage")}
              </button>
              <button
                type="button"
                className={MENU_ITEM}
                onClick={() => runFromMenu(() => handleExport("pdf"))}
              >
                <FileText />
                {t("downloadPdf")}
              </button>
              <div className="my-1 h-px bg-border" />
              <button
                type="button"
                className={cn(MENU_ITEM, "text-error [&_svg]:text-error")}
                onClick={() => runFromMenu(clearCanvas)}
              >
                <Trash2 />
                {t("clearCanvas")}
              </button>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>

        {status && (
          <span
            role="status"
            className={cn(
              "inline-flex items-center gap-1.5 px-2 text-xs whitespace-nowrap",
              status.tone === "error"
                ? "text-error"
                : status.tone === "ok"
                  ? "text-teal-bright"
                  : "text-text-secondary"
            )}
          >
            {status.tone === "busy" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : status.tone === "ok" ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <AlertCircle className="h-3.5 w-3.5" />
            )}
            {status.text}
          </span>
        )}
      </div>
    </Panel>
  );
}
