"use client";

import Link from "next/link";
import { BookOpen, Search, RotateCcw, LogIn, LogOut, Sparkles, Trophy, Share2, ListMusic, Heart, Flame } from "lucide-react";
import { useCanvasStore, serializeCanvas } from "@/store/canvas";
import { useAuthStore } from "@/store/auth";
import { useSocialStore } from "@/store/social";
import { useAudioStore } from "@/store/audio";
import type { AudioVerse } from "@/store/audio";
import type { Verse } from "@/types/quran";
import { buildAuthUrl } from "@/lib/pkce";
import { buildShareUrl } from "@/hooks/useCanvasPersistence";
import { useState, useEffect } from "react";

interface HeaderProps {
  onSearchOpen: () => void;
}

export function Header({ onSearchOpen }: HeaderProps) {
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);

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
  const { bumpStreak } = useSocialStore();

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
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Share API or clipboard failed — silent
    } finally {
      setSharing(false);
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

  const divider = (
    <span
      className="w-px h-4 mx-0.5 shrink-0"
      style={{ background: "var(--color-border)" }}
    />
  );

  return (
    <header
      className="flex items-center justify-between px-4 h-12 shrink-0"
      style={{
        background: "var(--color-surface)",
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      {/* Logo */}
      <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
        <BookOpen className="w-4 h-4" style={{ color: "var(--color-gold)" }} />
        <span className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
          Open Hikmah
        </span>
      </Link>

      {/* Right controls — three groups separated by dividers */}
      <div className="flex items-center gap-1.5">

        {/* Group 1: Canvas controls (only when nodes exist) */}
        {nodeCount > 0 && (
          <>
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleShare}
                disabled={sharing}
                title={sharing ? "Generating link…" : "Copy shareable link"}
                aria-label="Copy shareable canvas link"
                className="w-7 h-7 rounded border flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-wait"
                style={{
                  borderColor: copied ? "var(--color-teal)" : "var(--color-border)",
                  color: copied ? "var(--color-teal)" : "var(--color-text-muted)",
                }}
              >
                <Share2 className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={handlePlayGraph}
                title={audioCurrentRef ? "Stop playback" : "Play all verses in Quran order"}
                aria-label={audioCurrentRef ? "Stop audio playback" : "Play Graph — recite all verses"}
                className="w-7 h-7 rounded border flex items-center justify-center transition-colors cursor-pointer"
                style={{
                  borderColor: audioCurrentRef ? "var(--color-teal)" : "var(--color-border)",
                  color: audioCurrentRef ? "var(--color-teal)" : "var(--color-text-muted)",
                }}
              >
                <ListMusic className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={reset}
                title="Clear canvas"
                aria-label="Clear all verses from canvas"
                className="w-7 h-7 rounded border flex items-center justify-center transition-colors cursor-pointer hover:border-red-700 hover:text-red-400"
                style={{
                  borderColor: "var(--color-border)",
                  color: "var(--color-text-muted)",
                }}
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>

            {divider}
          </>
        )}

        {/* Group 2: Navigation */}
        <div className="flex items-center gap-1.5">
          <Link
            href="/names"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-xs transition-colors border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-gold)] hover:text-[var(--color-gold)]"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>99 Names</span>
          </Link>

          <button
            onClick={onSearchOpen}
            title="Search ⌘K"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-xs transition-colors cursor-pointer border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-gold)] hover:text-[var(--color-gold)]"
          >
            <Search className="w-3.5 h-3.5" />
            <span>Search</span>
          </button>
        </div>

        {divider}

        {/* Group 3: Identity & social */}
        <div className="flex items-center gap-1.5">
          {accessToken && (
            <Link
              href="/social"
              title="Friends & Leaderboard"
              className="w-7 h-7 rounded border flex items-center justify-center transition-colors border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-teal)] hover:text-[var(--color-teal)]"
            >
              <Trophy className="w-3.5 h-3.5" />
            </Link>
          )}

          {accessToken && (
            <Link
              href="/bookmarks"
              title="Bookmarks"
              className="flex items-center gap-1 px-2 py-1.5 rounded border text-xs transition-colors border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-gold)] hover:text-[var(--color-gold)]"
            >
              <Heart className="w-3.5 h-3.5" />
              {bookmarkCount > 0 && <span>{bookmarkCount}</span>}
            </Link>
          )}

          {accessToken ? (
            <>
              {/* Username pill with streak inlined */}
              <div
                className="flex items-center gap-1.5 px-2 py-1 rounded border text-xs"
                style={{
                  borderColor: "var(--color-border)",
                  background: "var(--color-surface-raised)",
                  color: "var(--color-text-secondary)",
                }}
              >
                <span
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                  style={{ background: "var(--color-teal)", color: "var(--color-bg)" }}
                >
                  {(username ?? "?")[0].toUpperCase()}
                </span>
                {username && (
                  <span className="max-w-[96px] truncate" style={{ color: "var(--color-text-primary)" }}>
                    {username}
                  </span>
                )}
                {streak > 0 && (
                  <>
                    <Flame className="w-3 h-3 shrink-0" fill="currentColor" style={{ color: "var(--color-gold)" }} />
                    <span style={{ color: "var(--color-gold)" }}>{streak}</span>
                  </>
                )}
              </div>

              <button
                onClick={handleSignOut}
                title="Sign out"
                aria-label="Sign out"
                className="w-7 h-7 rounded border flex items-center justify-center transition-colors cursor-pointer hover:border-[var(--color-text-secondary)] hover:text-[var(--color-text-secondary)]"
                style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <button
              onClick={handleSignIn}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-xs transition-colors cursor-pointer border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-teal)] hover:text-[var(--color-teal)]"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Sign in</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
