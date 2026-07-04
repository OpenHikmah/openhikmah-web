"use client";

import { useEffect, useState } from "react";

interface Props {
  slug: string;
  accent: string;
}

export function NameReflection({ slug, accent }: Props) {
  const [reflection, setReflection] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/names/${slug}/reflection`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: { reflection: string }) => {
        if (!cancelled) setReflection(data.reflection);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (error) return null;

  return (
    <div
      className="rounded-lg p-5 space-y-3"
      style={{
        background: "var(--color-surface)",
        border: `1px solid color-mix(in srgb, ${accent} 25%, var(--color-border))`,
      }}
    >
      <div className="flex items-center gap-2">
        <span className="text-xs font-mono uppercase tracking-widest" style={{ color: accent }}>
          Believer&apos;s Reflection
        </span>
        <span className="text-xs font-arabic" style={{ color: "var(--color-text-muted)" }}>
          التخلق
        </span>
      </div>

      {!reflection ? (
        <div className="space-y-2 animate-pulse">
          {[100, 90, 95].map((w, i) => (
            <div
              key={i}
              className="h-3 rounded"
              style={{ width: `${w}%`, background: "var(--color-surface-raised)" }}
            />
          ))}
        </div>
      ) : (
        <p
          className="text-sm leading-relaxed italic"
          style={{ color: "var(--color-text-secondary)" }}
        >
          {reflection}
        </p>
      )}
    </div>
  );
}
