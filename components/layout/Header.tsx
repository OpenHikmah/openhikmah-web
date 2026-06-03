"use client";

import Link from "next/link";
import { BookOpen, Search, RotateCcw, LogIn, LogOut, Sparkles, Trophy, Share2, ListMusic, Heart, Flame, Save, FolderOpen } from "lucide-react";
import { useCanvasStore, serializeCanvas } from "@/store/canvas";
import { useAuthStore } from "@/store/auth";
import { useSocialStore } from "@/store/social";
import { useAudioStore } from "@/store/audio";
import type { AudioVerse } from "@/store/audio";
import type { Verse } from "@/types/quran";
import { buildAuthUrl } from "@/lib/pkce";
import { buildShareUrl } from "@/hooks/useCanvasPersistence";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button, IconButton, Tooltip, buttonVariants, iconButtonVariants } from "@/components/ui";
import { useCopyFeedback } from "@/hooks/useCopyFeedback";

interface HeaderProps {
  onSearchOpen: () => void;
}

export function Header({ onSearchOpen }: HeaderProps) {
  const { copied, copy } = useCopyFeedback();
  const [sharing, setSharing] = useState(false);
  const [workspaceSaved, setWorkspaceSaved] = useState(false);
  const [workspaceSaving, setWorkspaceSaving] = useState(false);
  const [workspaceSaveError, setWorkspaceSaveError] = useState(false);

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

  return (
    <header className="flex items-center justify-between px-4 h-14 shrink-0 bg-surface border-b border-border">
      {/* Logo */}
      <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
        <BookOpen className="w-4 h-4 text-gold" />
        <span className="text-sm font-medium text-text-primary">Open Hikmah</span>
      </Link>

      {/* Right controls — three groups separated by dividers */}
      <div className="flex items-center gap-1.5">

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
            <span>99 Names</span>
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

          {accessToken ? (
            <>
              {/* Username pill with streak inlined */}
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border bg-surface-raised text-xs text-text-secondary">
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 bg-teal text-bg">
                  {(username ?? "?")[0].toUpperCase()}
                </span>
                {username && (
                  <span className="max-w-[96px] truncate text-text-primary">{username}</span>
                )}
                {streak > 0 && (
                  <>
                    <Flame className="w-3 h-3 shrink-0 text-gold" fill="currentColor" />
                    <span className="text-gold">{streak}</span>
                  </>
                )}
              </div>

              <Tooltip label="Sign out">
                <IconButton onClick={handleSignOut} aria-label="Sign out">
                  <LogOut />
                </IconButton>
              </Tooltip>
            </>
          ) : (
            <Button variant="secondary" size="sm" onClick={handleSignIn}>
              <LogIn className="w-3.5 h-3.5" />
              <span>Sign in</span>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
