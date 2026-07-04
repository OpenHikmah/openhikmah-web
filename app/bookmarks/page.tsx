"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Heart, Trash2, Network } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { AuthShell } from "@/components/layout/AuthShell";
import { Card, IconButton, Tooltip, iconButtonVariants } from "@/components/ui";
import type { Verse } from "@/types/quran";

const verseCache = new Map<string, Verse>();

export default function BookmarksPage() {
  const bookmarks = useAuthStore((s) => s.bookmarks);
  const toggleBookmark = useAuthStore((s) => s.toggleBookmark);
  const [verses, setVerses] = useState<Map<string, Verse>>(new Map());
  const [loading, setLoading] = useState(bookmarks.length > 0);

  useEffect(() => {
    if (bookmarks.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all(
      bookmarks.map(async (ref) => {
        const cached = verseCache.get(ref);
        if (cached) return [ref, cached] as const;
        try {
          const [surah, ayah] = ref.split(":");
          const res = await fetch(`/api/verse/${surah}/${ayah}`);
          if (!res.ok) return [ref, null] as const;
          const verse = (await res.json()) as Verse;
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
    <AuthShell>
      <div className="mx-auto w-full max-w-2xl">
        {/* Page header */}
        <div className="mb-8 flex items-center gap-3">
          <Heart className="h-5 w-5 text-gold" />
          <h1 className="text-lg font-semibold text-text-primary">Bookmarks</h1>
          {bookmarks.length > 0 && (
            <span className="rounded border border-border px-1.5 py-0.5 font-mono text-xs text-text-muted">
              {bookmarks.length}
            </span>
          )}
        </div>

        {bookmarks.length === 0 ? (
          <div className="py-20 text-center">
            <Heart className="mx-auto mb-4 h-8 w-8 text-text-muted/40" />
            <p className="text-sm text-text-muted">No bookmarks yet.</p>
            <p className="mt-1 text-xs text-text-muted">
              Tap the heart icon on any verse in the canvas to save it.
            </p>
            <Link
              href="/canvas"
              className="mt-5 inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm text-text-secondary transition-colors hover:border-gold-muted hover:text-gold"
            >
              <Network className="h-3.5 w-3.5" />
              Open canvas
            </Link>
          </div>
        ) : loading ? (
          <div className="space-y-3">
            {bookmarks.map((ref) => (
              <div
                key={ref}
                className="animate-pulse rounded-xl border border-border bg-surface p-5"
              >
                <div className="mb-4 flex items-center gap-2">
                  <div className="h-5 w-14 rounded bg-surface-overlay" />
                  <div className="h-4 w-24 rounded bg-surface-overlay" />
                </div>
                <div className="mb-2 h-5 w-full rounded bg-surface-overlay" />
                <div className="h-4 w-3/4 rounded bg-surface-overlay" />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {bookmarks.map((ref) => {
              const verse = verses.get(ref);
              return (
                <Card key={ref} className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="rounded border border-gold bg-gold/[0.08] px-1.5 py-0.5 font-mono text-xs text-gold">
                        {ref}
                      </span>
                      {verse && <span className="text-xs text-text-muted">{verse.surahName}</span>}
                    </div>
                    <div className="flex items-center gap-1">
                      <Tooltip label="Open in canvas">
                        <Link
                          href={`/canvas?verse=${ref}`}
                          aria-label="Open in canvas"
                          className={iconButtonVariants({ tone: "teal", size: "xs" })}
                        >
                          <Network />
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
                    <div className="mt-4 space-y-3">
                      <p className="font-arabic text-right text-base leading-loose text-text-primary">
                        {verse.arabicText}
                      </p>
                      <p className="text-sm leading-relaxed text-text-secondary">
                        {verse.translation}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-text-muted">Could not load verse text.</p>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AuthShell>
  );
}
