"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Network,
  FolderOpen,
  Heart,
  BookOpen,
  Flame,
  Trophy,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { useSocialStore } from "@/store/social";
import { Card } from "@/components/ui";
import { VerseOfDayCard } from "@/components/today/VerseOfDayCard";
import { CanvasPreview } from "./CanvasPreview";
import { CANVAS_STORAGE_KEY } from "@/hooks/useCanvasPersistence";
import { JOURNEYS } from "@/lib/journeys";
import type { Verse } from "@/types/quran";
import type { SavedCanvas } from "@/store/canvas";

export function PersonalHome({ verse }: { verse: Verse | null }) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const bookmarkCount = useAuthStore((s) => s.bookmarks.length);
  const username = useSocialStore((s) => s.username);
  const streak = useSocialStore((s) => s.streak);

  const [continueCount, setContinueCount] = useState<number | null>(null);
  const [savedCount, setSavedCount] = useState<number | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CANVAS_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as SavedCanvas;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved?.v === 1) setContinueCount(saved.nodes.length);
    } catch {
      // Corrupt storage — leave as null (no "continue" affordance).
    }
  }, []);

  useEffect(() => {
    if (!accessToken) return;
    fetch("/api/workspace", { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((r) => (r.ok ? r.json() : []))
      .then((ws: unknown[]) => setSavedCount(Array.isArray(ws) ? ws.length : 0))
      .catch(() => {});
  }, [accessToken]);

  const hasContinue = continueCount !== null && continueCount > 0;

  return (
    <main className="mx-auto w-full max-w-[1180px] flex-1 px-6 py-8 md:px-12 md:py-10">
      {/* Greeting */}
      <div className="mb-7 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-text-muted">
            Assalamu alaykum
          </p>
          <h1 className="mt-1.5 text-[clamp(1.5rem,3.2vw,2.1rem)] font-semibold tracking-[-0.02em] text-text-primary">
            {username ? (
              <>
                Welcome back,{" "}
                <span className="text-gold">{username}</span>
              </>
            ) : (
              "Welcome back"
            )}
          </h1>
        </div>
        {streak > 0 && (
          <div className="flex items-center gap-2 rounded-full border border-gold/40 bg-gold/[0.08] px-3.5 py-1.5 text-gold">
            <Flame className="h-4 w-4" fill="currentColor" />
            <span className="text-sm font-semibold">{streak}-day streak</span>
          </div>
        )}
      </div>

      {/* Bento grid — Canvas featured (2/3 wide) + 4 secondary tiles */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">

        {/* Canvas — spans 2 columns on lg, full width on sm, with live preview as background */}
        <Link href="/canvas" className="block sm:col-span-2">
          <Card
            interactive
            className="relative h-[200px] overflow-hidden p-0 sm:h-[224px]"
          >
            {/* The animated canvas preview fills the card but fades toward the bottom */}
            <div
              className="absolute inset-0"
              style={{
                maskImage:
                  "linear-gradient(to bottom, black 20%, rgba(0,0,0,0.25) 100%)",
                WebkitMaskImage:
                  "linear-gradient(to bottom, black 20%, rgba(0,0,0,0.25) 100%)",
              }}
            >
              <CanvasPreview />
            </div>

            {/* Bottom gradient so text is always legible against the preview */}
            <div className="absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-t from-surface via-surface/85 to-transparent" />

            {/* Content anchored to the bottom-left */}
            <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-5">
              <div>
                <div className="mb-0.5 flex items-center gap-2">
                  <Network className="h-[15px] w-[15px] text-teal" />
                  <p className="text-[13.5px] font-semibold text-text-primary">
                    {hasContinue ? "Continue your canvas" : "Open the canvas"}
                  </p>
                </div>
                <p className="pl-[23px] text-xs text-text-muted">
                  {hasContinue
                    ? `${continueCount} verse${continueCount === 1 ? "" : "s"} in progress`
                    : "Map connections between verses"}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-text-muted" />
            </div>
          </Card>
        </Link>

        {/* Bookmarks — same row as canvas on lg */}
        <Link href="/bookmarks" className="block">
          <Card
            interactive
            className="flex h-[200px] flex-col justify-between p-5 sm:h-[224px]"
          >
            <Heart className="h-5 w-5 text-gold" />
            <div>
              <p className="text-[13.5px] font-semibold text-text-primary">Bookmarks</p>
              <p className="mt-0.5 text-xs text-text-muted">
                {bookmarkCount > 0
                  ? `${bookmarkCount} saved verse${bookmarkCount === 1 ? "" : "s"}`
                  : "Save verses to revisit"}
              </p>
            </div>
          </Card>
        </Link>

        {/* Saved canvases */}
        <Link href="/workspaces" className="block">
          <Card interactive className="flex h-[148px] flex-col justify-between p-5">
            <FolderOpen className="h-5 w-5 text-gold" />
            <div>
              <p className="text-[13.5px] font-semibold text-text-primary">Saved canvases</p>
              <p className="mt-0.5 text-xs text-text-muted">
                {savedCount === null
                  ? "Your library"
                  : `${savedCount} canvas${savedCount === 1 ? "" : "es"}`}
              </p>
            </div>
          </Card>
        </Link>

        {/* 99 Names */}
        <Link href="/names" className="block">
          <Card interactive className="flex h-[148px] flex-col justify-between p-5">
            <BookOpen className="h-5 w-5 text-teal" />
            <div>
              <p className="text-[13.5px] font-semibold text-text-primary">The 99 Names</p>
              <p className="mt-0.5 text-xs text-text-muted">Asma&apos;ul Husna</p>
            </div>
          </Card>
        </Link>

        {/* Social */}
        <Link href="/social" className="block">
          <Card interactive className="flex h-[148px] flex-col justify-between p-5">
            <Trophy className="h-5 w-5 text-gold" />
            <div>
              <p className="text-[13.5px] font-semibold text-text-primary">Friends &amp; streaks</p>
              <p className="mt-0.5 text-xs text-text-muted">Leaderboard &amp; challenges</p>
            </div>
          </Card>
        </Link>
      </div>

      {/* Journeys */}
      <div className="mt-8">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-gold" />
          <h2 className="text-sm font-medium text-text-primary">Begin a journey</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {JOURNEYS.map((j) => (
            <Link
              key={j.ref}
              href={`/canvas?verse=${j.ref}`}
              className="rounded-md border border-border bg-surface px-4 py-2 text-sm text-text-primary transition-[color,border-color] duration-[120ms] hover:border-gold-muted hover:text-gold"
            >
              {j.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Verse of the Day */}
      {verse && (
        <div className="mt-8">
          <VerseOfDayCard verse={verse} />
        </div>
      )}
    </main>
  );
}
