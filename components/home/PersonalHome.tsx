"use client";

import { useEffect, useState, type ComponentType } from "react";
import Link from "next/link";
import { Flame, LayoutTemplate, FolderOpen, Heart, ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
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
      <Card interactive className="flex items-center gap-3.5 rounded-xl p-4 active:scale-[0.99]">
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
  const tNav = useTranslations("nav");
  const tBookmarks = useTranslations("bookmarks");
  const tErrors = useTranslations("errors");
  const t = useTranslations("home");
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
    <main className="mx-auto w-full min-h-0 max-w-5xl flex-1 overflow-y-auto px-6 pt-[clamp(0.75rem,4.5vh,2.5rem)] pb-mobile-nav md:px-8 md:pb-[clamp(0.75rem,4.5vh,2.5rem)]">
      {/* Greeting */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-text-muted">
            {t("greeting")}
          </p>
          <h1 className="mt-1.5 text-[clamp(1.5rem,3.5vw,2.1rem)] font-semibold tracking-[-0.02em] text-text-primary">
            {!accessToken
              ? // Anonymous visitor with local canvas progress (see HomeView.tsx) — a
                // "welcome back" greeting would falsely imply a recognised, signed-in
                // identity while the header still shows "Log in".
                t("continueExploring")
              : username
                ? t.rich("welcomeBackNamed", {
                    name: username,
                    gold: (chunks) => <span className="text-gold">{chunks}</span>,
                  })
                : t("welcomeBack")}
          </h1>
        </div>
        {streak > 0 && (
          <div className="flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/[0.08] px-3 py-1.5 text-gold">
            <Flame className="h-3.5 w-3.5" fill="currentColor" />
            <span className="text-sm font-semibold">{tNav("dayStreak", { count: streak })}</span>
          </div>
        )}
      </div>

      {/* Two columns at lg: the Verse of the Day leads, destinations sit alongside
          so the page fills the width instead of stranding a narrow centre column. */}
      <div className="mt-[clamp(1rem,3.5vh,2rem)] grid items-start gap-6 lg:grid-cols-[1.5fr_1fr]">
        {verse ? (
          <VerseOfDayCard verse={verse} />
        ) : (
          <Card className="p-5 text-sm text-text-muted">{tErrors("todayVerseUnavailable")}</Card>
        )}

        <div className="grid gap-3">
          <QuickLink
            href="/canvas"
            icon={LayoutTemplate}
            title={hasContinue ? t("continueCanvas") : t("openCanvas")}
            subtitle={
              hasContinue ? t("versesInProgress", { count: continueCount }) : t("searchAVerse")
            }
          />
          {accessToken && (
            <QuickLink
              href="/workspaces"
              icon={FolderOpen}
              title={tNav("savedCanvases")}
              subtitle={
                savedCount !== null
                  ? t("savedCanvasCount", { count: savedCount })
                  : savedCountError
                    ? t("savedCanvasesLoadError")
                    : t("savedGraphs")
              }
            />
          )}
          <QuickLink
            href="/bookmarks"
            icon={Heart}
            title={tNav("bookmarks")}
            subtitle={tBookmarks("savedCount", { count: bookmarks.length })}
          />
        </div>
      </div>
    </main>
  );
}
