"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Network, Volume2, Pause, Heart, Share2, Check } from "lucide-react";
import type { Verse } from "@/types/quran";
import { cn } from "@/lib/utils";
import { Card, IconButton, Tooltip, ReflectionNote, buttonVariants } from "@/components/ui";
import { useAudioStore } from "@/store/audio";
import { useAuthStore } from "@/store/auth";
import { useCopyFeedback } from "@/hooks/useCopyFeedback";

/**
 * The full Verse of the Day card (design.md §5.1): a floating, shareable surface
 * with a gold top-accent, the verse in enlarged Amiri, an optional editorial
 * reflection, and real actions (open on canvas / listen / bookmark / share).
 * Lives at /today and is reachable from the landing strip. The algorithmic
 * source carries no reflection yet; the `reflection` prop is here for the future
 * admin-curated override (design.md §6.A).
 */
export function VerseOfDayCard({
  verse,
  reflection,
}: {
  verse: Verse;
  reflection?: string;
}) {
  const playVerse = useAudioStore((s) => s.playVerse);
  const pauseAudio = useAudioStore((s) => s.pause);
  const resumeAudio = useAudioStore((s) => s.resume);
  const currentRef = useAudioStore((s) => s.currentRef);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const isThisCurrent = currentRef === verse.ref;
  const isThisPlaying = isThisCurrent && isPlaying;

  const toggleBookmark = useAuthStore((s) => s.toggleBookmark);
  const bookmarkedInStore = useAuthStore((s) => s.isBookmarked(verse.ref));

  const { copied, copy } = useCopyFeedback();
  // The auth store rehydrates bookmarks from localStorage on the client, which
  // the server can't know. Gate the bookmark visual on mount so the first client
  // render matches the server HTML (unbookmarked), avoiding a hydration mismatch.
  // The one-time mount flag is React's documented pattern for this; the lint
  // rule's cascading-render concern doesn't apply to a single post-mount flip.
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);
  const isBookmarked = mounted && bookmarkedInStore;

  const handleListen = () => {
    if (isThisPlaying) pauseAudio();
    else if (isThisCurrent) resumeAudio();
    else playVerse({ ref: verse.ref, surah: verse.surah, ayah: verse.ayah, surahName: verse.surahName });
  };

  const handleShare = () => {
    void copy(`${window.location.origin}/today`);
  };

  return (
    <Card className="relative w-full max-w-xl overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
      {/* Gold top-accent rule — shadows/accents are allowed on floating surfaces (§3.3) */}
      <div className="h-1 w-full bg-gold" />

      <div className="space-y-5 p-6 sm:p-8">
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
            Verse of the day
          </span>
          <span className="shrink-0 rounded border border-gold bg-gold/10 px-1.5 py-0.5 font-mono text-xs text-gold">
            {verse.ref}
          </span>
        </div>

        <div className="flex items-baseline gap-2">
          <span className="text-sm text-text-secondary">{verse.surahName}</span>
          {verse.surahNameArabic && (
            <span className="font-arabic text-sm text-text-muted">{verse.surahNameArabic}</span>
          )}
        </div>

        <p dir="rtl" className="font-arabic text-right text-[22px] leading-[2.05] text-text-primary">
          {verse.arabicText}
        </p>

        <p className="text-[15px] leading-relaxed text-text-secondary">{verse.translation}</p>

        {reflection && <ReflectionNote>{reflection}</ReflectionNote>}

        <div className="flex items-center gap-2 pt-1">
          <Link
            href={`/canvas?verse=${verse.ref}`}
            className={cn(buttonVariants({ variant: "primary", size: "md" }), "gap-2")}
          >
            <Network className="h-4 w-4" />
            Open on canvas
          </Link>

          <Tooltip label={isThisPlaying ? "Pause recitation" : "Listen"}>
            <IconButton
              tone="teal"
              onClick={handleListen}
              aria-label={isThisPlaying ? "Pause recitation" : "Listen to recitation"}
              className={cn(isThisCurrent && "border-teal text-teal")}
            >
              {isThisPlaying ? <Pause /> : <Volume2 />}
            </IconButton>
          </Tooltip>

          <Tooltip label={isBookmarked ? "Remove bookmark" : "Bookmark"}>
            <IconButton
              tone="gold"
              onClick={() => toggleBookmark(verse.ref)}
              aria-label={isBookmarked ? "Remove bookmark" : "Bookmark verse"}
              className={cn(isBookmarked && "border-gold-muted text-gold")}
            >
              <Heart fill={isBookmarked ? "currentColor" : "none"} />
            </IconButton>
          </Tooltip>

          <Tooltip label={copied ? "Copied!" : "Share"}>
            <IconButton
              onClick={handleShare}
              aria-label="Copy link to today's verse"
              className={cn(copied && "border-teal text-teal")}
            >
              {copied ? <Check /> : <Share2 />}
            </IconButton>
          </Tooltip>
        </div>
      </div>
    </Card>
  );
}
