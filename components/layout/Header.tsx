"use client";

import { Search, RotateCcw, Share2, ListMusic } from "lucide-react";
import { useCanvasStore, serializeCanvas } from "@/store/canvas";
import { useAuthStore } from "@/store/auth";
import { useSocialStore } from "@/store/social";
import { useAudioStore } from "@/store/audio";
import type { AudioVerse } from "@/store/audio";
import type { Verse } from "@/types/quran";
import { buildShareUrl } from "@/hooks/useCanvasPersistence";
import { useState, useEffect, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useCopyFeedback } from "@/hooks/useCopyFeedback";
import { AccountMenu } from "./AccountMenu";
import { Wordmark } from "./Wordmark";
import { HeaderNavLinks } from "./HeaderNavLinks";

interface HeaderProps {
  onSearchOpen: () => void;
}

/** A thumb-sized icon+label button for the mobile bottom action bar (≥56px tap target). */
function BarButton({
  icon,
  label,
  onClick,
  active,
  disabled,
  danger,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
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
}

export function Header({ onSearchOpen }: HeaderProps) {
  const { copied, copy } = useCopyFeedback();
  const [sharing, setSharing] = useState(false);

  const reset = useCanvasStore((s) => s.reset);
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
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
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, userId]);

  // Poll for incoming friend requests every 60 s while signed in
  useEffect(() => {
    if (!accessToken || !userId) return;
    const load = () =>
      fetch("/api/social/friends", {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
        .then((r) => (r.ok ? r.json() : []))
        .then((data: { status: string; direction: string }[]) => {
          const count = data.filter(
            (f) => f.status === "pending" && f.direction === "received"
          ).length;
          setPendingFriendCount(count);
        })
        .catch(() => {});
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
        <div className="fixed inset-x-0 bottom-0 z-40 flex md:hidden bg-surface/95 backdrop-blur border-t border-border pb-[env(safe-area-inset-bottom)]">
          <BarButton icon={<Search />} label="Search" onClick={onSearchOpen} />
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
          <BarButton icon={<RotateCcw />} label="Clear" onClick={reset} danger />
        </div>
      )}
    </>
  );
}
