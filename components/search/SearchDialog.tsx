"use client";

import { useState, useEffect, useRef } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Search, X, Loader2, BookOpen } from "lucide-react";
import { useCanvasStore } from "@/store/canvas";
import type { Verse } from "@/types/quran";

interface SearchDialogProps {
  open: boolean;
  onClose: () => void;
}

const SEED_VERSES: Array<{ ref: string; label: string }> = [
  { ref: "1:1", label: "Al-Fatiha — Opening" },
  { ref: "2:255", label: "Ayat al-Kursi" },
  { ref: "112:1", label: "Al-Ikhlas — Sincerity" },
  { ref: "55:1", label: "Ar-Rahman — The Merciful" },
  { ref: "36:1", label: "Ya-Sin — Opening" },
  { ref: "24:35", label: "Ayat al-Nur — The Light" },
];

export function SearchDialog({ open, onClose }: SearchDialogProps) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const addVerseNode = useCanvasStore((s) => s.addVerseNode);
  const hasNode = useCanvasStore((s) => s.hasNode);
  const nodes = useCanvasStore((s) => s.nodes);

  useEffect(() => {
    if (open) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const loadVerse = async (ref: string) => {
    if (hasNode(ref)) {
      onClose();
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/verse/${ref.replace(":", "/")}`);
      if (!res.ok) throw new Error("Verse not found");
      const verse: Verse = await res.json();
      const isFirst = nodes.length === 0;
      addVerseNode(
        { ...verse, isRoot: isFirst },
        isFirst ? { x: 0, y: 0 } : undefined
      );
      onClose();
    } catch {
      alert("Verse not found. Try a format like 2:255");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    if (/^\d+:\d+$/.test(trimmed)) {
      loadVerse(trimmed);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" />
        <Dialog.Content
          className="fixed top-[20%] left-1/2 -translate-x-1/2 w-full max-w-lg z-50 outline-none"
          aria-describedby={undefined}
        >
          <Dialog.Title className="sr-only">Search Quran Verses</Dialog.Title>
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl overflow-hidden">
            <form
              onSubmit={handleSubmit}
              className="flex items-center gap-3 px-4 py-3 border-b border-[var(--color-border)]"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 text-[var(--color-gold)] animate-spin shrink-0" />
              ) : (
                <Search className="w-4 h-4 text-[var(--color-text-muted)] shrink-0" />
              )}
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Enter verse ref (e.g. 2:255)…"
                className="flex-1 bg-transparent text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] outline-none"
                disabled={loading}
              />
              <button
                type="button"
                onClick={onClose}
                className="text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </form>

            <div className="p-3">
              <p className="text-xs text-[var(--color-text-muted)] px-2 mb-2 uppercase tracking-wider font-mono">
                Popular starting points
              </p>
              <div className="space-y-1">
                {SEED_VERSES.map((sv) => (
                  <button
                    key={sv.ref}
                    onClick={() => loadVerse(sv.ref)}
                    disabled={loading}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left hover:bg-[var(--color-surface-raised)] transition-colors group disabled:opacity-50"
                  >
                    <div className="w-7 h-7 rounded-md bg-[var(--color-surface-overlay)] flex items-center justify-center shrink-0">
                      <BookOpen className="w-3.5 h-3.5 text-[var(--color-text-muted)] group-hover:text-[var(--color-gold)] transition-colors" />
                    </div>
                    <span className="flex-1 text-sm text-[var(--color-text-secondary)] group-hover:text-[var(--color-text-primary)] transition-colors">
                      {sv.label}
                    </span>
                    <span className="text-xs font-mono text-[var(--color-text-muted)]">
                      {sv.ref}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
