"use client";

import { BookOpen, Search, Sparkles } from "lucide-react";
import { useCanvasStore } from "@/store/canvas";

interface HeaderProps {
  onSearchOpen: () => void;
}

export function Header({ onSearchOpen }: HeaderProps) {
  const reset = useCanvasStore((s) => s.reset);
  const nodeCount = useCanvasStore((s) => s.nodes.length);

  return (
    <header className="flex items-center justify-between px-6 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface)] z-10 shrink-0">
      <button
        onClick={reset}
        className="flex items-center gap-2.5 group"
      >
        <div className="w-7 h-7 rounded-lg bg-[var(--color-gold)] bg-opacity-15 flex items-center justify-center border border-[var(--color-gold)] border-opacity-30 group-hover:border-opacity-60 transition-all">
          <BookOpen className="w-3.5 h-3.5 text-[var(--color-gold)]" />
        </div>
        <span className="text-sm font-semibold tracking-wide text-[var(--color-text-primary)]">
          Open Hikmah
        </span>
      </button>

      <div className="flex items-center gap-2">
        {nodeCount > 0 && (
          <span className="text-xs text-[var(--color-text-muted)] font-mono mr-2">
            {nodeCount} verse{nodeCount !== 1 ? "s" : ""}
          </span>
        )}

        <button
          onClick={onSearchOpen}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-[var(--color-text-secondary)] border border-[var(--color-border)] hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] transition-all"
        >
          <Search className="w-3.5 h-3.5" />
          <span>Search verses</span>
          <kbd className="ml-1 text-[10px] text-[var(--color-text-muted)] font-mono">⌘K</kbd>
        </button>

        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-[var(--color-teal)] border border-[var(--color-teal)] border-opacity-30 bg-[var(--color-teal)] bg-opacity-5">
          <Sparkles className="w-3.5 h-3.5" />
          <span>AI-powered</span>
        </div>
      </div>
    </header>
  );
}
