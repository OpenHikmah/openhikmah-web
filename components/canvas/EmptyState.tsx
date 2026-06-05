"use client";

import { Search, BookOpen } from "lucide-react";

interface EmptyStateProps {
  onSearchOpen: () => void;
}

export function EmptyState({ onSearchOpen }: EmptyStateProps) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <div className="pointer-events-auto max-w-xs text-center">
        <div className="mx-auto mb-5 flex h-10 w-10 items-center justify-center rounded-md border border-gold/20 bg-gold/[0.07]">
          <BookOpen className="h-5 w-5 text-gold" />
        </div>

        <p className="mb-1.5 text-sm font-medium text-text-primary">Start exploring</p>
        <p className="mb-6 text-xs leading-relaxed text-text-muted">
          Search a verse or theme. AI maps semantic connections across the Quran.
        </p>

        <button
          onClick={onSearchOpen}
          className="inline-flex cursor-pointer items-center gap-2 rounded border border-gold/25 bg-gold/[0.08] px-4 py-2 text-xs font-medium text-gold transition-colors hover:bg-gold/[0.12]"
        >
          <Search className="h-3.5 w-3.5" />
          Search verses
          <kbd className="rounded bg-gold/10 px-1 font-mono text-[10px] text-text-muted">⌘K</kbd>
        </button>
      </div>
    </div>
  );
}
