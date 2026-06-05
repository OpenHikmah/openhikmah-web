"use client";

import Link from "next/link";
import { Search, RotateCcw, LogIn, LogOut, Sparkles, Trophy, Share2, ListMusic, Heart, Flame, Save, FolderOpen, Menu } from "lucide-react";
import { useCanvasStore, serializeCanvas } from "@/store/canvas";
import { useAuthStore } from "@/store/auth";
import { useSocialStore } from "@/store/social";
import { useAudioStore } from "@/store/audio";
import type { AudioVerse } from "@/store/audio";
import type { Verse } from "@/types/quran";
import { buildAuthUrl } from "@/lib/pkce";
import { buildShareUrl } from "@/hooks/useCanvasPersistence";
import { useState, useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button, IconButton, Tooltip, buttonVariants, iconButtonVariants } from "@/components/ui";
import { useCopyFeedback } from "@/hooks/useCopyFeedback";
import { AccountMenu } from "./AccountMenu";
import { Wordmark } from "./Wordmark";

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
  const [workspaceSaved, setWorkspaceSaved] = useState(false);
  const [workspaceSaving, setWorkspaceSaving] = useState(false);
  const [workspaceSaveError, setWorkspaceSaveError] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const reset = useCanvasStore((s) => s.reset);
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const nodeCount = nodes.length;

  const accessToken = useAuthStore((s) => s.accessToken);
  const bookmarkCount = useAuthStore((s) => s.bookmarks.length);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  const username = useSocialStore((s) => s.username);
  const userId = useSocialStore((s) => s.userId);
  const streak = useSocialStore((s) => s.streak);
  const pendingFriendCount = useSocialStore((s) => s.pendingFriendCount);
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

  // Close the mobile menu on outside-click or Escape
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const handlePlayGraph = () => {
    if (audioCurrentRef) {
      stopAudio();
      return;
    }
    const verses: AudioVerse[] = [...nodes]
      .map((n) => n.data as unknown as Verse)
      .filter((v) => v?.surah && v?.ayah)
      .sort((a, b) => a.surah !== b.surah ? a.surah - b.surah : a.ayah - b.ayah)
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
      // Share API or clipboard failed — silent
    } finally {
      setSharing(false);
    }
  };

  const handleSaveWorkspace = async () => {
    if (workspaceSaving || !accessToken || nodeCount === 0) return;
    setWorkspaceSaving(true);
    try {
      const date = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const name = `${nodeCount} verse${nodeCount === 1 ? "" : "s"} — ${date}`;
      const res = await fetch("/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ name, data: serializeCanvas(nodes, edges), nodeCount }),
      });
      if (res.ok) {
        setWorkspaceSaved(true);
        setTimeout(() => setWorkspaceSaved(false), 2000);
      } else {
        setWorkspaceSaveError(true);
        setTimeout(() => setWorkspaceSaveError(false), 2000);
      }
    } catch {
      setWorkspaceSaveError(true);
      setTimeout(() => setWorkspaceSaveError(false), 2000);
    } finally {
      setWorkspaceSaving(false);
    }
  };

  const handleSignOut = async () => {
    await fetch("/api/auth/signout", { method: "POST" }).catch(() => {});
    clearAuth();
  };

  const handleSignIn = async () => {
    const { url, codeVerifier, state, nonce } = await buildAuthUrl();
    sessionStorage.setItem("pkce_code_verifier", codeVerifier);
    sessionStorage.setItem("pkce_state", state);
    sessionStorage.setItem("pkce_nonce", nonce);
    window.location.href = url;
  };

  const divider = <span className="w-px h-5 mx-0.5 shrink-0 bg-border" />;

  // Shared row style for the mobile dropdown menu (≥48px tap targets, labelled).
  const mobileMenuItem =
    "flex items-center gap-3 h-12 px-3 rounded-lg text-sm text-text-primary hover:bg-white/5 [&_svg]:size-[18px] [&_svg]:text-text-secondary";

  return (
    <>
      <header className="flex items-center justify-between px-6 md:px-12 h-[60px] shrink-0 bg-bg border-b border-border">
        <Wordmark />

        {/* Right controls — desktop only (md+). Three groups separated by dividers */}
        <div className="hidden md:flex items-center gap-1.5">

          {/* Group 1: Canvas controls (only when nodes exist) */}
          {nodeCount > 0 && (
            <>
              <div className="flex items-center gap-1.5">
                <Tooltip label={sharing ? "Generating link…" : copied ? "Copied!" : "Copy shareable link"}>
                  <IconButton
                    onClick={handleShare}
                    disabled={sharing}
                    aria-label="Copy shareable canvas link"
                    className={cn("disabled:cursor-wait", copied && "border-teal text-teal")}
                  >
                    <Share2 />
                  </IconButton>
                </Tooltip>

                <Tooltip label={audioCurrentRef ? "Stop playback" : "Play all verses in Quran order"}>
                  <IconButton
                    onClick={handlePlayGraph}
                    aria-label={audioCurrentRef ? "Stop audio playback" : "Play Graph — recite all verses"}
                    className={cn(audioCurrentRef && "border-teal text-teal")}
                  >
                    <ListMusic />
                  </IconButton>
                </Tooltip>

                {accessToken && (
                  <Tooltip label={workspaceSaved ? "Saved!" : workspaceSaveError ? "Save failed — try again" : "Save canvas to account"}>
                    <IconButton
                      onClick={handleSaveWorkspace}
                      disabled={workspaceSaving}
                      aria-label="Save canvas to account"
                      className={cn(
                        "disabled:cursor-wait",
                        workspaceSaved && "border-teal text-teal",
                        workspaceSaveError && "border-error text-error"
                      )}
                    >
                      <Save />
                    </IconButton>
                  </Tooltip>
                )}

                <Tooltip label="Clear canvas">
                  <IconButton tone="danger" onClick={reset} aria-label="Clear all verses from canvas">
                    <RotateCcw />
                  </IconButton>
                </Tooltip>
              </div>

              {divider}
            </>
          )}

          {/* Group 2: Navigation */}
          <div className="flex items-center gap-1.5">
            <Link href="/names" className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}>
              <Sparkles className="w-3.5 h-3.5" />
              <span>Asma&apos;ul Husna</span>
            </Link>

            <Tooltip label="Search ⌘K">
              <Button variant="secondary" size="sm" onClick={onSearchOpen}>
                <Search className="w-3.5 h-3.5" />
                <span>Search</span>
              </Button>
            </Tooltip>
          </div>

          {divider}

          {/* Group 3: Identity & social */}
          <div className="flex items-center gap-1.5">
            {accessToken && (
              <Tooltip label="Friends & Leaderboard">
                <Link
                  href="/social"
                  aria-label="Friends & Leaderboard"
                  className={cn(iconButtonVariants({ tone: "teal" }), "relative")}
                >
                  <Trophy />
                  {pendingFriendCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] rounded-full flex items-center justify-center text-[9px] font-bold px-0.5 bg-gold text-bg">
                      {pendingFriendCount > 9 ? "9+" : pendingFriendCount}
                    </span>
                  )}
                </Link>
              </Tooltip>
            )}

            {accessToken && (
              <Tooltip label="Bookmarks">
                <Link
                  href="/bookmarks"
                  aria-label="Bookmarks"
                  className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "gap-1.5")}
                >
                  <Heart className="w-3.5 h-3.5" />
                  {bookmarkCount > 0 && <span>{bookmarkCount}</span>}
                </Link>
              </Tooltip>
            )}

            {accessToken && (
              <Tooltip label="Saved workspaces">
                <Link
                  href="/workspaces"
                  aria-label="Saved workspaces"
                  className={cn(iconButtonVariants({ tone: "teal" }))}
                >
                  <FolderOpen />
                </Link>
              </Tooltip>
            )}

            <AccountMenu />
          </div>
        </div>

        {/* Mobile: hamburger menu for secondary actions (<md) */}
        <div ref={menuRef} className="relative flex md:hidden items-center">
          <IconButton onClick={() => setMenuOpen((o) => !o)} aria-label="Menu" aria-expanded={menuOpen}>
            <Menu />
          </IconButton>
          {accessToken && pendingFriendCount > 0 && !menuOpen && (
            <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] rounded-full flex items-center justify-center text-[9px] font-bold px-0.5 bg-gold text-bg">
              {pendingFriendCount > 9 ? "9+" : pendingFriendCount}
            </span>
          )}
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-[calc(100%+10px)] z-50 w-60 rounded-xl border border-border bg-surface-overlay p-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.5)]"
            >
              {accessToken && (
                <div className="flex items-center gap-2 px-3 py-2 mb-1 border-b border-border">
                  <span className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 bg-teal text-bg">
                    {(username ?? "?")[0].toUpperCase()}
                  </span>
                  <span className="truncate text-sm text-text-primary">{username ?? "Signed in"}</span>
                  {streak > 0 && (
                    <span className="ml-auto flex items-center gap-1 text-gold">
                      <Flame className="w-3.5 h-3.5" fill="currentColor" />
                      <span className="text-xs">{streak}</span>
                    </span>
                  )}
                </div>
              )}

              <button onClick={() => { setMenuOpen(false); onSearchOpen(); }} className={mobileMenuItem}>
                <Search /> Search
              </button>
              <Link href="/names" onClick={() => setMenuOpen(false)} className={mobileMenuItem}>
                <Sparkles /> Asma&apos;ul Husna
              </Link>

              {accessToken && (
                <>
                  <Link href="/social" onClick={() => setMenuOpen(false)} className={mobileMenuItem}>
                    <Trophy /> Friends &amp; Leaderboard
                    {pendingFriendCount > 0 && (
                      <span className="ml-auto min-w-[18px] h-[18px] rounded-full flex items-center justify-center text-[10px] font-bold px-1 bg-gold text-bg">
                        {pendingFriendCount > 9 ? "9+" : pendingFriendCount}
                      </span>
                    )}
                  </Link>
                  <Link href="/bookmarks" onClick={() => setMenuOpen(false)} className={mobileMenuItem}>
                    <Heart /> Bookmarks
                    {bookmarkCount > 0 && <span className="ml-auto text-xs text-text-muted">{bookmarkCount}</span>}
                  </Link>
                  <Link href="/workspaces" onClick={() => setMenuOpen(false)} className={mobileMenuItem}>
                    <FolderOpen /> Saved canvases
                  </Link>
                </>
              )}

              <div className="h-px bg-border my-1.5 mx-2" />

              {accessToken ? (
                <button onClick={() => { setMenuOpen(false); handleSignOut(); }} className={mobileMenuItem}>
                  <LogOut /> Sign out
                </button>
              ) : (
                <button
                  onClick={() => { setMenuOpen(false); handleSignIn(); }}
                  className={cn(mobileMenuItem, "justify-center bg-gold text-bg font-semibold [&_svg]:text-bg")}
                >
                  <LogIn /> Sign in
                </button>
              )}
            </div>
          )}
        </div>
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
