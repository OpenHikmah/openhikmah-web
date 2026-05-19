"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Search, X, Loader2, BookOpen, Network } from "lucide-react";
import { useCanvasStore } from "@/store/canvas";
import type { Verse, SearchResult } from "@/types/quran";
import { cn } from "@/lib/utils";

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
  const [previewVerse, setPreviewVerse] = useState<Verse | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const addVerseNode = useCanvasStore((s) => s.addVerseNode);
  const setPendingAutoExpand = useCanvasStore((s) => s.setPendingAutoExpand);
  const hasNode = useCanvasStore((s) => s.hasNode);
  const nodes = useCanvasStore((s) => s.nodes);

  useEffect(() => {
    if (open) {
      setQuery("");
      setPreviewVerse(null);
      setSearchResults([]);
      setPreviewError(false);
      setLoading(false);
      setIsSearching(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      // Cancel in-flight requests on close
      abortRef.current?.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    }
  }, [open]);

  const fetchPreview = useCallback(async (ref: string, signal: AbortSignal) => {
    setLoading(true);
    setPreviewVerse(null);
    setPreviewError(false);
    try {
      const res = await fetch(`/api/verse/${ref.replace(":", "/")}`, { signal });
      if (!res.ok) throw new Error("Not found");
      const verse: Verse = await res.json();
      setPreviewVerse(verse);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setPreviewError(true);
      }
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, []);

  const fetchSearch = useCallback(async (q: string, signal: AbortSignal) => {
    setIsSearching(true);
    setSearchResults([]);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal });
      if (!res.ok) throw new Error();
      const results: SearchResult[] = await res.json();
      setSearchResults(results);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setSearchResults([]);
      }
    } finally {
      if (!signal.aborted) setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    abortRef.current?.abort();

    const trimmed = query.trim();
    if (!trimmed) {
      setPreviewVerse(null);
      setSearchResults([]);
      setPreviewError(false);
      setLoading(false);
      setIsSearching(false);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    if (/^\d+:\d+$/.test(trimmed)) {
      setSearchResults([]);
      debounceRef.current = setTimeout(() => fetchPreview(trimmed, controller.signal), 250);
    } else {
      setPreviewVerse(null);
      setPreviewError(false);
      debounceRef.current = setTimeout(() => fetchSearch(trimmed, controller.signal), 420);
    }

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, fetchPreview, fetchSearch]);

  const mapConnections = useCallback(
    (verse: Verse) => {
      const isFirst = nodes.length === 0;
      const nodeId = addVerseNode(
        { ...verse, isRoot: isFirst },
        isFirst ? { x: 0, y: 0 } : undefined
      );
      if (isFirst) {
        setPendingAutoExpand(nodeId);
      }
      onClose();
    },
    [nodes.length, addVerseNode, setPendingAutoExpand, onClose]
  );

  const loadSeedVerse = useCallback(
    async (ref: string) => {
      if (hasNode(ref)) {
        onClose();
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(`/api/verse/${ref.replace(":", "/")}`);
        if (!res.ok) throw new Error();
        const verse: Verse = await res.json();
        mapConnections(verse);
      } catch {
        // silent — seed verses are curated and should always exist
      } finally {
        setLoading(false);
      }
    },
    [hasNode, onClose, mapConnections]
  );

  const busy = loading || isSearching;
  const showSeedVerses = !query.trim();
  const showPreview = !!previewVerse && !loading;
  const showResults = searchResults.length > 0 && !isSearching;

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content
          className="fixed top-[15%] left-1/2 -translate-x-1/2 w-full max-w-lg z-50 outline-none px-4"
          aria-describedby={undefined}
        >
          <Dialog.Title className="sr-only">Search Quran Verses</Dialog.Title>
          <div
            className="rounded-md border overflow-hidden"
            style={{
              background: "var(--color-surface)",
              borderColor: "var(--color-border)",
              boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
            }}
          >
            {/* Input bar */}
            <div
              className="flex items-center gap-3 px-4 py-3 border-b"
              style={{ borderColor: "var(--color-border)" }}
            >
              {busy ? (
                <Loader2
                  className="w-4 h-4 animate-spin shrink-0"
                  style={{ color: "var(--color-gold)" }}
                />
              ) : (
                <Search
                  className="w-4 h-4 shrink-0"
                  style={{ color: "var(--color-text-muted)" }}
                />
              )}
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search topics, or enter a ref like 2:255…"
                className="flex-1 bg-transparent text-sm outline-none"
                style={{ color: "var(--color-text-primary)" }}
              />
              <button
                type="button"
                onClick={query ? () => setQuery("") : onClose}
                className="transition-colors hover:text-[var(--color-text-secondary)]"
                style={{ color: "var(--color-text-muted)" }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content area */}
            <div className="max-h-[60vh] overflow-y-auto">
              {showPreview && (
                <VerseCard
                  verse={previewVerse}
                  alreadyAdded={hasNode(previewVerse.ref)}
                  onMapConnections={() => mapConnections(previewVerse)}
                />
              )}

              {previewError && !loading && (
                <div className="px-4 py-6 text-center">
                  <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                    Verse not found. Try a format like{" "}
                    <code className="font-mono" style={{ color: "var(--color-gold)" }}>2:255</code>
                  </p>
                </div>
              )}

              {showResults && (
                <div className="p-3 space-y-0.5">
                  {searchResults.map((result) => (
                    <SearchResultRow
                      key={result.ref}
                      result={result}
                      alreadyAdded={hasNode(result.ref)}
                      onSelect={async () => {
                        setLoading(true);
                        try {
                          const res = await fetch(`/api/verse/${result.ref.replace(":", "/")}`);
                          if (!res.ok) throw new Error();
                          const verse: Verse = await res.json();
                          mapConnections(verse);
                        } catch {
                          // silent
                        } finally {
                          setLoading(false);
                        }
                      }}
                    />
                  ))}
                </div>
              )}

              {!showSeedVerses && !showPreview && !showResults && !busy && !previewError && (
                <div className="px-4 py-8 text-center">
                  <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                    No results found
                  </p>
                </div>
              )}

              {showSeedVerses && (
                <div className="p-3">
                  <p
                    className="text-xs px-2 mb-2 font-mono"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    Popular starting points
                  </p>
                  <div className="space-y-0.5">
                    {SEED_VERSES.map((sv) => (
                      <button
                        key={sv.ref}
                        onClick={() => loadSeedVerse(sv.ref)}
                        disabled={busy}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors",
                          "hover:bg-[var(--color-surface-raised)] disabled:opacity-50 disabled:cursor-not-allowed"
                        )}
                      >
                        <div
                          className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
                          style={{ background: "var(--color-surface-overlay)" }}
                        >
                          <BookOpen className="w-3.5 h-3.5" style={{ color: "var(--color-text-muted)" }} />
                        </div>
                        <span className="flex-1 text-sm" style={{ color: "var(--color-text-secondary)" }}>
                          {sv.label}
                        </span>
                        <span className="text-xs font-mono" style={{ color: "var(--color-text-muted)" }}>
                          {sv.ref}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function VerseCard({
  verse,
  alreadyAdded,
  onMapConnections,
}: {
  verse: Verse;
  alreadyAdded: boolean;
  onMapConnections: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);

  const handleClick = async () => {
    if (submitting || alreadyAdded) return;
    setSubmitting(true);
    try {
      onMapConnections();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="m-3 rounded-md border p-3 space-y-3"
      style={{
        background: "var(--color-surface-raised)",
        borderColor: "var(--color-border)",
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className="text-xs font-mono"
          style={{ color: "var(--color-text-secondary)" }}
        >
          {verse.surahName}
        </span>
        <span
          className="text-xs font-mono px-1.5 py-0.5 rounded border shrink-0"
          style={{
            color: "var(--color-gold)",
            borderColor: "var(--color-gold)",
            background: "rgba(201,168,76,0.08)",
          }}
        >
          {verse.ref}
        </span>
      </div>

      <p
        className="font-arabic text-right text-base leading-loose line-clamp-2"
        style={{ color: "var(--color-text-primary)" }}
      >
        {verse.arabicText}
      </p>

      <p
        className="text-xs leading-relaxed line-clamp-2"
        style={{ color: "var(--color-text-secondary)" }}
      >
        {verse.translation}
      </p>

      <button
        onClick={handleClick}
        disabled={alreadyAdded || submitting}
        className={cn(
          "w-full flex items-center justify-center gap-2 py-2 rounded text-xs font-medium transition-colors cursor-pointer",
          alreadyAdded || submitting
            ? "cursor-not-allowed opacity-60"
            : "hover:brightness-110 active:scale-[0.98]"
        )}
        style={{
          background: alreadyAdded
            ? "var(--color-surface-overlay)"
            : "var(--color-teal)",
          color: alreadyAdded ? "var(--color-text-muted)" : "#ffffff",
        }}
      >
        {submitting ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Network className="w-3.5 h-3.5" />
        )}
        {alreadyAdded ? "Already on canvas" : "Map Connections"}
      </button>
    </div>
  );
}

function SearchResultRow({
  result,
  alreadyAdded,
  onSelect,
}: {
  result: SearchResult;
  alreadyAdded: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      disabled={alreadyAdded}
      className={cn(
        "w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left transition-colors",
        "hover:bg-[var(--color-surface-raised)] disabled:opacity-50 disabled:cursor-not-allowed"
      )}
    >
      <div
        className="w-8 h-8 rounded-md flex items-center justify-center shrink-0 mt-0.5"
        style={{ background: "var(--color-surface-overlay)" }}
      >
        <BookOpen className="w-4 h-4" style={{ color: "var(--color-text-muted)" }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs font-mono" style={{ color: "var(--color-gold)" }}>
            {result.ref}
          </span>
          <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            {result.surahName}
          </span>
        </div>
        {result.snippet && (
          <p
            className="text-xs leading-relaxed line-clamp-2"
            style={{ color: "var(--color-text-secondary)" }}
          >
            {result.snippet}
          </p>
        )}
      </div>
      <Network
        className="w-3.5 h-3.5 shrink-0 mt-1"
        style={{
          color: alreadyAdded ? "var(--color-teal)" : "var(--color-text-muted)",
        }}
      />
    </button>
  );
}
