"use client";

import Link from "next/link";
import { BookOpen, Search, RotateCcw, LogIn, LogOut, Sparkles, Trophy, Share2, ListMusic, Heart } from "lucide-react";
import { useCanvasStore, serializeCanvas } from "@/store/canvas";
import { useAuthStore } from "@/store/auth";
import { useSocialStore } from "@/store/social";
import { useAudioStore } from "@/store/audio";
import type { AudioVerse } from "@/store/audio";
import type { Verse } from "@/types/quran";
import { buildAuthUrl } from "@/lib/pkce";
import { buildShareUrl } from "@/hooks/useCanvasPersistence";
import { StreakBadge } from "@/components/social/StreakBadge";
import { useState } from "react";

interface HeaderProps {
  onSearchOpen: () => void;
}

export function Header({ onSearchOpen }: HeaderProps) {
  const [copied, setCopied] = useState(false);

  const reset = useCanvasStore((s) => s.reset);
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const nodeCount = nodes.length;
  const accessToken = useAuthStore((s) => s.accessToken);
  const bookmarkCount = useAuthStore((s) => s.bookmarks.length);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const username = useSocialStore((s) => s.username);

  const playGraph = useAudioStore((s) => s.playGraph);
  const audioCurrentRef = useAudioStore((s) => s.currentRef);
  const stopAudio = useAudioStore((s) => s.stop);

  const handlePlayGraph = () => {
    if (audioCurrentRef) {
      stopAudio();
      return;
    }
    // Sort nodes in Quran order (by surah then ayah)
    const verses: AudioVerse[] = [...nodes]
      .map((n) => n.data as unknown as Verse)
      .filter((v) => v?.surah && v?.ayah)
      .sort((a, b) => a.surah !== b.surah ? a.surah - b.surah : a.ayah - b.ayah)
      .map((v) => ({ ref: v.ref, surah: v.surah, ayah: v.ayah, surahName: v.surahName }));
    if (verses.length > 0) playGraph(verses);
  };

  const [sharing, setSharing] = useState(false);

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

  return (
    <header
      className="flex items-center justify-between px-4 h-12 shrink-0"
      style={{
        background: "var(--color-surface)",
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      {/* Logo — click to go home */}
      <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
        <BookOpen className="w-4 h-4" style={{ color: "var(--color-gold)" }} />
        <span
          className="text-sm font-medium"
          style={{ color: "var(--color-text-primary)" }}
        >
          Open Hikmah
        </span>
      </Link>

      {/* Right controls */}
      <div className="flex items-center gap-2">
        {nodeCount > 0 && (
          <span
            className="text-xs font-mono"
            style={{ color: "var(--color-text-muted)" }}
          >
            {nodeCount} verse{nodeCount !== 1 ? "s" : ""}
          </span>
        )}

        {nodeCount > 0 && (
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
        )}

        {nodeCount > 0 && (
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
        )}

        {nodeCount > 0 && (
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
        )}

        <StreakBadge />

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

        <Link
          href="/names"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-xs transition-colors border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-gold)] hover:text-[var(--color-gold)]"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>99 Names</span>
        </Link>

        <button
          onClick={onSearchOpen}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-xs transition-colors cursor-pointer border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-gold)] hover:text-[var(--color-gold)]"
        >
          <Search className="w-3.5 h-3.5" />
          <span>Search</span>
          <kbd
            className="ml-0.5 text-[10px] font-mono px-1 rounded"
            style={{ color: "var(--color-text-muted)", background: "var(--color-surface-overlay)" }}
          >
            ⌘K
          </kbd>
        </button>

        {accessToken ? (
          <>
            <div
              className="flex items-center gap-1.5 px-2 py-1 rounded border text-xs font-mono"
              style={{ borderColor: "var(--color-teal)", color: "var(--color-teal)" }}
            >
              <span
                className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
                style={{ background: "var(--color-teal)", color: "var(--color-bg)" }}
              >
                {(username ?? "?")[0].toUpperCase()}
              </span>
              <span>{username ?? "signed in"}</span>
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
    </header>
  );
}
