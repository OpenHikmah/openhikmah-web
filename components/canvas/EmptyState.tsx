"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { JOURNEYS } from "@/lib/journeys";

interface EmptyStateProps {
  onSearchOpen: () => void;
}

export function EmptyState({ onSearchOpen }: EmptyStateProps) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <div className="pointer-events-auto max-w-sm text-center">
        <p className="mb-6 text-sm leading-relaxed text-text-muted">
          Search a verse or theme — AI maps semantic connections across the Qur&apos;an.
        </p>

        <button
          onClick={onSearchOpen}
          className="inline-flex cursor-pointer items-center gap-2 rounded border border-gold/25 bg-gold/[0.08] px-4 py-2 text-xs font-medium text-gold transition-colors hover:bg-gold/[0.12]"
        >
          <Search className="h-3.5 w-3.5" />
          Search verses
          <kbd className="rounded bg-gold/10 px-1 font-mono text-[10px] text-text-muted">⌘K</kbd>
        </button>

        {/* One-tap journeys — start a beautiful canvas with zero typing. */}
        <div className="mt-6">
          <p className="mb-2.5 text-[11px] uppercase tracking-[0.16em] text-text-muted">
            Or begin with
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {JOURNEYS.map((j) => (
              <Link
                key={j.ref}
                href={`/canvas?verse=${j.ref}`}
                className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs text-text-secondary transition-[color,border-color] duration-[120ms] hover:border-gold-muted hover:text-gold"
              >
                {j.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
