"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, Trash2, ArrowLeft } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import type { Verse } from "@/types/quran";

export default function BookmarksPage() {
  const bookmarks = useAuthStore((s) => s.bookmarks);
  const toggleBookmark = useAuthStore((s) => s.toggleBookmark);
  const [verses, setVerses] = useState<Map<string, Verse>>(new Map());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (bookmarks.length === 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    Promise.all(
      bookmarks.map(async (ref) => {
        if (verses.has(ref)) return [ref, verses.get(ref)!] as const;
        try {
          const [surah, ayah] = ref.split(":").map(Number);
          const res = await fetch(
            `https://api.alquran.cloud/v1/ayah/${surah}:${ayah}/editions/quran-uthmani,en.asad`
          );
          const json = await res.json();
          const [arabic, eng] = json.data as Array<{ text: string; surah: { englishName: string; name: string } }>;
          const verse: Verse = {
            surah,
            ayah,
            ref: ref as Verse["ref"],
            arabicText: arabic.text,
            translation: eng.text,
            surahName: arabic.surah.englishName,
            surahNameArabic: arabic.surah.name,
          };
          return [ref, verse] as const;
        } catch {
          return [ref, null] as const;
        }
      })
    ).then((entries) => {
      setVerses(
        new Map(
          entries.filter((e): e is [string, Verse] => e[1] !== null)
        )
      );
      setLoading(false);
    });
  }, [bookmarks.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "var(--color-bg)", color: "var(--color-text-primary)" }}
    >
      {/* Header */}
      <header
        className="flex items-center gap-3 px-6 h-12 shrink-0 border-b"
        style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
      >
        <Link
          href="/"
          className="w-7 h-7 rounded border flex items-center justify-center transition-colors"
          style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
        >
          <ArrowLeft className="w-3.5 h-3.5" />
        </Link>
        <BookOpen className="w-4 h-4" style={{ color: "var(--color-gold)" }} />
        <span className="text-sm font-medium">Bookmarks</span>
        {bookmarks.length > 0 && (
          <span
            className="text-xs font-mono px-1.5 py-0.5 rounded"
            style={{ background: "var(--color-surface-overlay)", color: "var(--color-text-muted)" }}
          >
            {bookmarks.length}
          </span>
        )}
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-8">
        {bookmarks.length === 0 ? (
          <div className="text-center py-20 space-y-3">
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
              No bookmarks yet.
            </p>
            <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              Tap the heart icon on any verse in the canvas to save it.
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border transition-colors mt-2"
              style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}
            >
              Open Canvas
            </Link>
          </div>
        ) : loading ? (
          <div className="space-y-3">
            {bookmarks.map((ref) => (
              <div
                key={ref}
                className="rounded-lg border p-4 animate-pulse"
                style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
              >
                <div className="h-3 w-16 rounded mb-3" style={{ background: "var(--color-surface-overlay)" }} />
                <div className="h-4 w-full rounded mb-2" style={{ background: "var(--color-surface-overlay)" }} />
                <div className="h-4 w-3/4 rounded" style={{ background: "var(--color-surface-overlay)" }} />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {bookmarks.map((ref) => {
              const verse = verses.get(ref);
              return (
                <div
                  key={ref}
                  className="rounded-lg border p-4 space-y-3"
                  style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="text-xs font-mono px-1.5 py-0.5 rounded border"
                        style={{
                          color: "var(--color-gold)",
                          borderColor: "var(--color-gold)",
                          background: "rgba(201,168,76,0.08)",
                        }}
                      >
                        {ref}
                      </span>
                      {verse && (
                        <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                          {verse.surahName}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => toggleBookmark(ref)}
                      title="Remove bookmark"
                      className="w-6 h-6 rounded flex items-center justify-center transition-colors cursor-pointer hover:text-red-400"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {verse ? (
                    <>
                      <p
                        className="font-arabic text-right text-base leading-loose"
                        style={{ color: "var(--color-text-primary)" }}
                      >
                        {verse.arabicText}
                      </p>
                      <p className="text-sm leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
                        {verse.translation}
                      </p>
                    </>
                  ) : (
                    <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                      Could not load verse text.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
