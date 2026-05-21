"use client";

import { Search, BookOpen } from "lucide-react";

interface EmptyStateProps {
  onSearchOpen: () => void;
}

export function EmptyState({ onSearchOpen }: EmptyStateProps) {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
      <div className="text-center max-w-xs pointer-events-auto">
        <div
          className="w-10 h-10 rounded-md border flex items-center justify-center mx-auto mb-5"
          style={{
            background: "rgba(201,168,76,0.07)",
            borderColor: "rgba(201,168,76,0.2)",
          }}
        >
          <BookOpen className="w-5 h-5" style={{ color: "var(--color-gold)" }} />
        </div>

        <p
          className="text-sm font-medium mb-1.5"
          style={{ color: "var(--color-text-primary)" }}
        >
          Start exploring
        </p>
        <p
          className="text-xs leading-relaxed mb-6"
          style={{ color: "var(--color-text-muted)" }}
        >
          Search a verse or theme. AI maps semantic connections across the Quran.
        </p>

        <button
          onClick={onSearchOpen}
          className="inline-flex items-center gap-2 px-4 py-2 rounded border text-xs font-medium transition-colors cursor-pointer"
          style={{
            background: "rgba(201,168,76,0.08)",
            borderColor: "rgba(201,168,76,0.25)",
            color: "var(--color-gold)",
          }}
        >
          <Search className="w-3.5 h-3.5" />
          Search verses
          <kbd
            className="text-[10px] font-mono px-1 rounded"
            style={{ color: "var(--color-text-muted)", background: "rgba(201,168,76,0.1)" }}
          >
            ⌘K
          </kbd>
        </button>

      </div>
    </div>
  );
}
