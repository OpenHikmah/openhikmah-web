"use client";

import { Search, Sparkles, BookOpen } from "lucide-react";

interface EmptyStateProps {
  onSearchOpen: () => void;
}

export function EmptyState({ onSearchOpen }: EmptyStateProps) {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
      <div className="text-center max-w-sm pointer-events-auto">
        <div className="w-16 h-16 rounded-2xl bg-[var(--color-gold)] bg-opacity-10 border border-[var(--color-gold)] border-opacity-20 flex items-center justify-center mx-auto mb-6">
          <BookOpen className="w-7 h-7 text-[var(--color-gold)] opacity-80" />
        </div>

        <h2 className="text-xl font-semibold text-[var(--color-text-primary)] mb-2">
          Begin Your Journey
        </h2>
        <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed mb-6">
          Search for a verse or theme. AI will discover semantic connections
          across the Quran, weaving an infinite map of divine wisdom.
        </p>

        <button
          onClick={onSearchOpen}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--color-gold)] bg-opacity-15 border border-[var(--color-gold)] border-opacity-40 text-[var(--color-gold)] text-sm font-medium hover:bg-opacity-25 hover:border-opacity-70 transition-all"
        >
          <Search className="w-4 h-4" />
          Search verses
        </button>

        <div className="mt-6 flex items-center justify-center gap-4 text-xs text-[var(--color-text-muted)]">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 rounded bg-[var(--color-theme-edge)]" />
            <span>Thematic</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 rounded bg-[var(--color-root-edge)]" />
            <span>Root word</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 rounded bg-[var(--color-contrast-edge)]" />
            <span>Contrast</span>
          </div>
        </div>
      </div>
    </div>
  );
}
