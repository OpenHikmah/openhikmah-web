"use client";

import { useEffect, useState, type ComponentType } from "react";
import Link from "next/link";
import { Flame, LayoutTemplate, FolderOpen, Heart, ArrowRight } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { useSocialStore } from "@/store/social";
import { Card } from "@/components/ui";
import { VerseOfDayCard } from "@/components/today/VerseOfDayCard";
import { CANVAS_STORAGE_KEY } from "@/hooks/useCanvasPersistence";
import type { Verse } from "@/types/quran";
import type { SavedCanvas } from "@/store/canvas";

/** A compact destination row: icon, title, supporting count, and a hover arrow. */
function QuickLink({
  href,
  icon: Icon,
  title,
  subtitle,
}: {
  href: string;
  icon: ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
}) {
  return (
    <Link href={href} className="group block">
      <Card
        interactive
        className="flex items-center gap-3.5 rounded-xl p-4 active:scale-[0.99]"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-surface-raised text-text-secondary transition-colors group-hover:border-gold-muted group-hover:text-gold">
          <Icon className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-text-primary">{title}</p>
          <p className="mt-0.5 truncate text-xs text-text-muted">{subtitle}</p>
        </div>
        <ArrowRight className="size-4 shrink-0 text-text-muted transition-transform duration-[160ms] ease-[cubic-bezier(0.2,0,0,1)] group-hover:translate-x-0.5 group-hover:text-text-secondary" />
      </Card>
    </Link>
  );
}

export function PersonalHome({ verse }: { verse: Verse | null }) {
  const bookmarks = useAuthStore((s) => s.bookmarks);
  const accessToken = useAuthStore((s) => s.accessToken);
  const username = useSocialStore((s) => s.username);
  const streak = useSocialStore((s) => s.streak);

  const [continueCount, setContinueCount] = useState<number | null>(null);
  const [savedCount, setSavedCount] = useState<number | null>(null);
  const [savedCountError, setSavedCountError] = useState(false);

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
      .then((r) => {
        if (!r.ok) throw new Error("workspace fetch failed");
        return r.json();
      })
      .then((ws: unknown[]) => setSavedCount(Array.isArray(ws) ? ws.length : 0))
      .catch(() => setSavedCountError(true));
  }, [accessToken]);

  const hasContinue = continueCount !== null && continueCount > 0;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 overflow-y-auto px-6 py-[clamp(0.75rem,4.5vh,2.5rem)] md:px-8">
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

      {/* Two columns at lg: the Verse of the Day leads, destinations sit alongside
          so the page fills the width instead of stranding a narrow centre column. */}
      <div className="mt-[clamp(1rem,3.5vh,2rem)] grid items-start gap-6 lg:grid-cols-[1.5fr_1fr]">
        {verse && <VerseOfDayCard verse={verse} />}

        <div className="grid gap-3">
          <QuickLink
            href="/canvas"
            icon={LayoutTemplate}
            title={hasContinue ? "Continue your canvas" : "Open the canvas"}
            subtitle={
              hasContinue
                ? `${continueCount} verse${continueCount === 1 ? "" : "s"} in progress`
                : "Search a verse and map its connections"
            }
          />
          <QuickLink
            href="/workspaces"
            icon={FolderOpen}
            title="Saved canvases"
            subtitle={
              savedCount !== null
                ? `${savedCount} saved canvas${savedCount === 1 ? "" : "es"}`
                : savedCountError
                  ? "Couldn't load your saved canvases"
                  : "Your saved graphs"
            }
          />
          <QuickLink
            href="/bookmarks"
            icon={Heart}
            title="Bookmarks"
            subtitle={
              bookmarks.length > 0
                ? `${bookmarks.length} saved verse${bookmarks.length === 1 ? "" : "s"}`
                : "No bookmarks yet"
            }
          />
        </div>
      </div>
    </main>
  );
}
