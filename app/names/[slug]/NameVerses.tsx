"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { VerseRef } from "@/types/quran";

interface NameVerse {
  ref: VerseRef;
  surah: number;
  ayah: number;
  arabicText: string;
  translation: string;
  surahName: string;
  surahNameArabic: string;
  reason: string;
}

interface Props {
  slug: string;
  accent: string;
}

export function NameVerses({ slug, accent }: Props) {
  const [verses, setVerses] = useState<NameVerse[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/names/${slug}/verses`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: NameVerse[]) => {
        if (!cancelled) setVerses(data);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => { cancelled = true; };
  }, [slug]);

  if (error) {
    return (
      <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
        Could not load verses at this time.
      </p>
    );
  }

  if (!verses) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg p-4 animate-pulse"
            style={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              height: "120px",
            }}
          />
        ))}
        <p
          className="text-xs text-center pt-2 font-mono"
          style={{ color: "var(--color-text-muted)" }}
        >
          Claude is finding verses…
        </p>
      </div>
    );
  }

  if (verses.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
        No verses found for this name.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {verses.map((verse, i) => (
        <article
          key={verse.ref}
          className="rounded-lg p-5"
          style={{
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
          }}
        >
          {/* Verse number + ref */}
          <div className="flex items-center justify-between mb-3">
            <span
              className="text-xs font-mono"
              style={{ color: "var(--color-text-muted)" }}
            >
              {i + 1}
            </span>
            <div className="flex items-center gap-2">
              <span
                className="font-arabic text-sm"
                style={{ color: "var(--color-text-secondary)" }}
              >
                {verse.surahNameArabic}
              </span>
              <span
                className="text-xs px-1.5 py-0.5 rounded font-mono"
                style={{
                  background: "var(--color-surface-raised)",
                  color: accent,
                  border: `1px solid color-mix(in srgb, ${accent} 30%, transparent)`,
                }}
              >
                {verse.ref}
              </span>
            </div>
          </div>

          {/* Arabic text */}
          <p
            className="font-arabic text-xl text-right leading-loose mb-3"
            style={{ color: "var(--color-text-primary)" }}
            dir="rtl"
          >
            {verse.arabicText}
          </p>

          {/* Translation */}
          <p
            className="text-sm leading-relaxed mb-3"
            style={{ color: "var(--color-text-secondary)" }}
          >
            {verse.translation}
          </p>

          {/* Reason / connection */}
          <div
            className="text-xs leading-relaxed pt-3 italic"
            style={{
              borderTop: "1px solid var(--color-border-subtle)",
              color: "var(--color-text-muted)",
            }}
          >
            <span style={{ color: accent }}>Connection: </span>
            {verse.reason}
          </div>

          {/* Open in canvas */}
          <div className="mt-3 flex justify-end">
            <Link
              href={`/?verse=${verse.ref}`}
              className="text-xs flex items-center gap-1 transition-opacity hover:opacity-80"
              style={{ color: accent }}
            >
              Map on Canvas →
            </Link>
          </div>
        </article>
      ))}
    </div>
  );
}
