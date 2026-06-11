"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Flame } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { useSocialStore } from "@/store/social";
import { Card } from "@/components/ui";
import { VerseOfDayCard } from "@/components/today/VerseOfDayCard";
import { CANVAS_STORAGE_KEY } from "@/hooks/useCanvasPersistence";
import type { Verse } from "@/types/quran";
import type { SavedCanvas } from "@/store/canvas";

export function PersonalHome({ verse }: { verse: Verse | null }) {
  const bookmarks = useAuthStore((s) => s.bookmarks);
  const accessToken = useAuthStore((s) => s.accessToken);
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
      // Corrupt storage — leave null.
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
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-10 md:px-8">
      {/* Greeting */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-text-muted">
            Assalamu alaykum
          </p>
          <h1 className="mt-1.5 text-[clamp(1.5rem,3.5vw,2.1rem)] font-semibold tracking-[-0.02em] text-text-primary">
            {username ? (
              <>Welcome back, <span className="text-gold">{username}</span></>
            ) : (
              "Welcome back"
            )}
          </h1>
        </div>
        {streak > 0 && (
          <div className="flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/[0.08] px-3 py-1.5 text-gold">
            <Flame className="h-3.5 w-3.5" fill="currentColor" />
            <span className="text-sm font-semibold">{streak}-day streak</span>
          </div>
        )}
      </div>

      {/* Verse of the Day — primary daily touchpoint */}
      {verse && (
        <div className="mt-8">
          <VerseOfDayCard verse={verse} />
        </div>
      )}

      {/* Continue canvas — single primary action */}
      <div className="mt-6">
        <Link href="/canvas" className="group block">
          <Card
            interactive
            className="flex items-center justify-between gap-4 rounded-xl p-5"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-text-primary">
                {hasContinue ? "Continue your canvas" : "Open the canvas"}
              </p>
              <p className="mt-0.5 text-xs text-text-muted">
                {hasContinue
                  ? `${continueCount} verse${continueCount === 1 ? "" : "s"} in progress`
                  : "Search a verse and map its connections"}
              </p>
            </div>
            <span className="shrink-0 rounded border border-border px-3 py-1.5 text-xs text-text-secondary transition-colors group-hover:border-text-muted">
              Open →
            </span>
          </Card>
        </Link>
      </div>

      {/* Stat row */}
      <div className="mt-4 flex gap-3 text-xs text-text-muted">
        {savedCount !== null && savedCount > 0 && (
          <Link href="/workspaces" className="transition-colors hover:text-gold">
            {savedCount} saved canvas{savedCount === 1 ? "" : "es"}
          </Link>
        )}
        {savedCount !== null && savedCount > 0 && bookmarks.length > 0 && (
          <span>·</span>
        )}
        {bookmarks.length > 0 && (
          <Link href="/bookmarks" className="transition-colors hover:text-gold">
            {bookmarks.length} bookmark{bookmarks.length === 1 ? "" : "s"}
          </Link>
        )}
      </div>
    </main>
  );
}
