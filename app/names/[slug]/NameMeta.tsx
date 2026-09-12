"use client";

import { useEffect, useState } from "react";

interface Meta {
  meaning: string;
  description: string;
}

interface Props {
  slug: string;
  locale: string;
  /** Canonical English text, shown immediately and kept on any fetch failure. */
  fallback: Meta;
  /** Server-prefetched translation, or `null`/`undefined` on a cache miss (the
   *  component then falls back to its own fetch, unchanged). Never fetched at
   *  all when `locale === "en"` — the fallback IS the canonical text. */
  initialMeta?: Meta | null;
  /** Rendered between the meaning and description text, e.g. the category/root
   *  badges — kept in the caller's server-rendered markup rather than
   *  duplicated here. */
  children?: React.ReactNode;
}

export function NameMeta({ slug, locale, fallback, initialMeta, children }: Props) {
  const [meta, setMeta] = useState<Meta | null>(initialMeta ?? null);

  useEffect(() => {
    if (locale === "en" || initialMeta != null) return; // already have it
    let cancelled = false;
    fetch(`/api/names/${slug}/meta`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: Meta) => {
        if (!cancelled && data.meaning && data.description) setMeta(data);
      })
      .catch(() => {
        // Silent — the canonical English fallback below is already showing.
      });
    return () => {
      cancelled = true;
    };
  }, [slug, locale, initialMeta]);

  const meaning = meta?.meaning || fallback.meaning;
  const description = meta?.description || fallback.description;

  return (
    <>
      <p className="mb-6 text-lg text-text-secondary">{meaning}</p>
      {children}
      <p className="mx-auto max-w-xl text-sm leading-relaxed text-text-secondary">{description}</p>
    </>
  );
}
