"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, Trash2, ArrowLeft, ExternalLink } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { Card, IconButton, Tooltip, iconButtonVariants } from "@/components/ui";
import type { Verse } from "@/types/quran";

// Module-level cache — survives re-renders without touching refs during render
const verseCache = new Map<string, Verse>();

export default function BookmarksPage() {
  const bookmarks = useAuthStore((s) => s.bookmarks);
  const toggleBookmark = useAuthStore((s) => s.toggleBookmark);
  const [verses, setVerses] = useState<Map<string, Verse>>(new Map());
  const [loading, setLoading] = useState(bookmarks.length > 0);

  useEffect(() => {
    if (bookmarks.length === 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    Promise.all(
      bookmarks.map(async (ref) => {
        const cached = verseCache.get(ref);
        if (cached) return [ref, cached] as const;
        try {
          const [surah, ayah] = ref.split(":");
          const res = await fetch(`/api/verse/${surah}/${ayah}`);
          if (!res.ok) return [ref, null] as const;
          const verse = await res.json() as Verse;
          verseCache.set(ref, verse);
          return [ref, verse] as const;
        } catch {
          return [ref, null] as const;
        }
      })
    ).then((entries) => {
      setVerses(new Map(entries.filter((e): e is [string, Verse] => e[1] !== null)));
      setLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookmarks.join(",")]);

  return (
    <div className="flex min-h-screen flex-col bg-bg text-text-primary">
      {/* Header */}
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-surface px-6">
        <Tooltip label="Back home">
          <Link
            href="/"
            aria-label="Back home"
            className={iconButtonVariants({ size: "xs" })}
          >
            <ArrowLeft />
          </Link>
        </Tooltip>
        <BookOpen className="h-4 w-4 text-gold" />
        <span className="text-sm font-medium">Bookmarks</span>
        {bookmarks.length > 0 && (
          <span className="rounded bg-surface-overlay px-1.5 py-0.5 font-mono text-xs text-text-muted">
            {bookmarks.length}
          </span>
        )}
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        {bookmarks.length === 0 ? (
          <div className="space-y-3 py-20 text-center">
            <p className="text-sm text-text-muted">No bookmarks yet.</p>
            <p className="text-xs text-text-muted">
              Tap the heart icon on any verse in the canvas to save it.
            </p>
            <Link
              href="/"
              className="mt-2 inline-flex items-center gap-1.5 rounded border border-border px-3 py-1.5 text-xs text-text-secondary transition-colors hover:border-gold-muted hover:text-gold"
            >
              Open Canvas
            </Link>
          </div>
        ) : loading ? (
          <div className="space-y-3">
            {bookmarks.map((ref) => (
              <Card key={ref} className="animate-pulse p-4">
                <div className="mb-3 h-3 w-16 rounded bg-surface-overlay" />
                <div className="mb-2 h-4 w-full rounded bg-surface-overlay" />
                <div className="h-4 w-3/4 rounded bg-surface-overlay" />
              </Card>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {bookmarks.map((ref) => {
              const verse = verses.get(ref);
              return (
                <Card key={ref} className="space-y-3 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded border border-gold bg-gold/[0.08] px-1.5 py-0.5 font-mono text-xs text-gold">
                        {ref}
                      </span>
                      {verse && <span className="text-xs text-text-muted">{verse.surahName}</span>}
                    </div>
                    <div className="flex items-center gap-1">
                      <Tooltip label="Open in canvas">
                        <Link
                          href={`/?verse=${ref}`}
                          aria-label="Open in canvas"
                          className={iconButtonVariants({ tone: "teal", size: "xs" })}
                        >
                          <ExternalLink />
                        </Link>
                      </Tooltip>
                      <Tooltip label="Remove bookmark">
                        <IconButton
                          tone="danger"
                          size="xs"
                          onClick={() => toggleBookmark(ref)}
                          aria-label="Remove bookmark"
                        >
                          <Trash2 />
                        </IconButton>
                      </Tooltip>
                    </div>
                  </div>

                  {verse ? (
                    <>
                      <p className="font-arabic text-right text-base leading-loose text-text-primary">
                        {verse.arabicText}
                      </p>
                      <p className="text-sm leading-relaxed text-text-secondary">{verse.translation}</p>
                    </>
                  ) : (
                    <p className="text-xs text-text-muted">Could not load verse text.</p>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
