"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Pairing {
  name: string;
  transliteration: string;
  arabic: string;
  explanation: string;
}

interface Props {
  slug: string;
  accent: string;
}

export function NamePairings({ slug, accent }: Props) {
  const [pairings, setPairings] = useState<Pairing[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/names/${slug}/pairings`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: Pairing[]) => {
        if (!cancelled) setPairings(data);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (error || (pairings !== null && pairings.length === 0)) return null;

  return (
    <div
      className="rounded-lg p-5 space-y-4"
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="text-xs font-mono uppercase tracking-widest"
          style={{ color: "var(--color-text-muted)" }}
        >
          Common Pairings
        </span>
      </div>

      {!pairings ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="animate-pulse space-y-1.5">
              <div className="h-3 rounded w-24" style={{ background: "var(--color-surface-raised)" }} />
              <div className="h-3 rounded w-full" style={{ background: "var(--color-surface-raised)" }} />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {pairings.map((p) => (
            <div key={p.transliteration} className="space-y-1">
              <div className="flex items-center gap-2">
                {p.name ? (
                  <Link
                    href={`/names/${p.name}`}
                    className="text-xs font-mono hover:underline"
                    style={{ color: accent }}
                  >
                    {p.transliteration}
                  </Link>
                ) : (
                  <span className="text-xs font-mono" style={{ color: accent }}>
                    {p.transliteration}
                  </span>
                )}
                <span className="font-arabic text-sm" style={{ color: "var(--color-text-muted)" }}>
                  {p.arabic}
                </span>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
                {p.explanation}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
