"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Search, X, Loader2, BookOpen, Network, CornerDownLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCanvasStore } from "@/store/canvas";
import { usePreferencesStore } from "@/store/preferences";
import { findFreeSlot, viewportCenter, NODE_WIDTH, NODE_HEIGHT } from "@/lib/canvas/canvas-layout";
import type { Verse, SearchResult, SearchResponse } from "@/types/quran";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui";

interface SearchDialogProps {
  open: boolean;
  onClose: () => void;
}

// Seed-verse labels stay untranslated — they're a fixed set of surah/verse names
// (transliteration + English gloss), not interface copy that varies by locale.
const SEED_VERSES: Array<{ ref: string; label: string }> = [
  { ref: "1:1", label: "Al-Fatiha — Opening" },
  { ref: "2:255", label: "Ayat al-Kursi" },
  { ref: "112:1", label: "Al-Ikhlas — Sincerity" },
  { ref: "55:1", label: "Ar-Rahman — The Merciful" },
  { ref: "36:1", label: "Ya-Sin — Opening" },
  { ref: "24:35", label: "Ayat al-Nur — The Light" },
];

export function SearchDialog({ open, onClose }: SearchDialogProps) {
  const t = useTranslations("search");
  const uiLocale = usePreferencesStore((s) => s.uiLocale);
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [previewVerse, setPreviewVerse] = useState<Verse | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [relatedResults, setRelatedResults] = useState<SearchResult[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [selectError, setSelectError] = useState(false);
  // Distinguishes "the search itself couldn't run" (rate limited, or the
  // upstream keyword API failed) from a genuine zero-match search — those
  // call for different copy instead of both silently reading as "no results".
  const [searchError, setSearchError] = useState<"rateLimited" | "unavailable" | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Separate from `abortRef` (the search/preview debounce) so selecting a result
  // doesn't get cancelled by unrelated search-input activity — only by the
  // dialog closing, which is the actual bug this guards against.
  const selectAbortRef = useRef<AbortController | null>(null);

  const addVerseNode = useCanvasStore((s) => s.addVerseNode);
  const setPendingAutoExpand = useCanvasStore((s) => s.setPendingAutoExpand);
  const setPendingPanToNode = useCanvasStore((s) => s.setPendingPanToNode);
  const hasNode = useCanvasStore((s) => s.hasNode);
  const nodes = useCanvasStore((s) => s.nodes);
  const viewport = useCanvasStore((s) => s.viewport);

  // Focus input when dialog opens — no setState, so this is safe in an effect
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
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
    setRelatedResults([]);
    setTotalResults(0);
    setSelectError(false);
    setSearchError(null);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal });
      if (res.status === 429) {
        setSearchError("rateLimited");
        return;
      }
      if (!res.ok) throw new Error();
      const data: SearchResponse = await res.json();
      if (res.headers.get("x-search-error") === "keyword-unavailable") {
        setSearchError("unavailable");
      }
      setSearchResults(data.results);
      setRelatedResults(data.related ?? []);
      setTotalResults(data.total);
      setHighlightedIndex(-1);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setSearchResults([]);
        setRelatedResults([]);
        setTotalResults(0);
        setSearchError("unavailable");
      }
    } finally {
      if (!signal.aborted) setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    abortRef.current?.abort();

    const trimmed = query.trim();
    if (!trimmed) return;

    const controller = new AbortController();
    abortRef.current = controller;

    if (/^\d+:\d+$/.test(trimmed)) {
      debounceRef.current = setTimeout(() => fetchPreview(trimmed, controller.signal), 250);
    } else {
      debounceRef.current = setTimeout(() => fetchSearch(trimmed, controller.signal), 420);
    }

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, fetchPreview, fetchSearch]);

  const mapConnections = useCallback(
    (verse: Verse) => {
      // Re-adding a verse already on canvas is allowed — the user may want to try
      // a different expansion (root/theme/contrast) on a second copy. Both copies
      // get a duplicate badge (VerseNode) so the user can tell they're linked.
      const isFirst = nodes.length === 0;
      // First node anchors at the origin; later searches drop into the nearest
      // empty slot beside the *visible* part of the graph, never overlapping.
      let position: { x: number; y: number } | undefined;
      if (isFirst) {
        position = { x: 0, y: 0 };
      } else {
        const anchorCenter = viewportCenter(viewport, window.innerWidth, window.innerHeight);
        const anchor = {
          x: anchorCenter.x - NODE_WIDTH / 2,
          y: anchorCenter.y - NODE_HEIGHT / 2,
        };
        position = findFreeSlot(
          nodes.map((n) => n.position),
          anchor
        );
      }
      const nodeId = addVerseNode({ ...verse, isRoot: isFirst }, position);
      if (isFirst) {
        setPendingAutoExpand(nodeId);
      } else {
        // The user has no way to know where a search-added verse landed on a
        // populated canvas, so pan the camera to it.
        setPendingPanToNode(nodeId);
      }
      onClose();
    },
    [nodes, viewport, addVerseNode, setPendingAutoExpand, setPendingPanToNode, onClose]
  );

  const loadSeedVerse = useCallback(
    async (ref: string) => {
      selectAbortRef.current?.abort();
      const controller = new AbortController();
      selectAbortRef.current = controller;
      setLoading(true);
      try {
        const res = await fetch(`/api/verse/${ref.replace(":", "/")}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error();
        const verse: Verse = await res.json();
        mapConnections(verse);
      } catch (err) {
        // An abort (dialog closed mid-fetch) is expected, not a failure to surface.
        if ((err as Error).name === "AbortError") return;
        console.error("Failed to fetch seed verse:", err);
        setSelectError(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [mapConnections]
  );

  const selectResult = useCallback(
    async (result: SearchResult) => {
      selectAbortRef.current?.abort();
      const controller = new AbortController();
      selectAbortRef.current = controller;
      setLoading(true);
      setSelectError(false);
      try {
        const res = await fetch(`/api/verse/${result.ref.replace(":", "/")}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error();
        const verse: Verse = await res.json();
        mapConnections(verse);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        console.error("Failed to fetch selected search result:", err);
        setSelectError(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [mapConnections]
  );

  const viewAllResults = useCallback(() => {
    const trimmed = query.trim();
    if (!trimmed || /^\d+:\d+$/.test(trimmed)) return;
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
    onClose();
  }, [query, router, onClose]);

  // Cancels in-flight requests and resets all dialog state. Run from an effect
  // on `open` rather than inline in onOpenChange/onClose, so a parent-controlled
  // close (the `open` prop flipping to false from outside a Radix-internal
  // trigger — e.g. the X button's onClick calling onClose directly) can't leave
  // the selection request running with stale state underneath it.
  const cancelAndReset = useCallback(() => {
    abortRef.current?.abort();
    selectAbortRef.current?.abort();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setQuery("");
    setPreviewVerse(null);
    setSearchResults([]);
    setRelatedResults([]);
    setTotalResults(0);
    setPreviewError(false);
    setLoading(false);
    setIsSearching(false);
    setSearchError(null);
    setHighlightedIndex(-1);
    setSelectError(false);
  }, []);

  useEffect(() => {
    // Legitimate external-prop sync: `open` is owned by the parent, not derived
    // from this component's own state, so reacting to it here isn't the
    // derived-state antipattern the set-state-in-effect rule normally guards.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!open) cancelAndReset();
  }, [open, cancelAndReset]);

  const busy = loading || isSearching;
  const showSeedVerses = !query.trim();
  const showPreview = !!previewVerse && !loading;
  const showResults = searchResults.length > 0 && !isSearching;
  const showRelated = relatedResults.length > 0 && !isSearching;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        // cancelAndReset runs from the `open` effect above, regardless of what
        // triggered the close — this just notifies the parent.
        if (!o) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content
          className="fixed top-[15%] left-1/2 -translate-x-1/2 w-full max-w-lg z-50 outline-none px-4"
          aria-describedby={undefined}
        >
          <Dialog.Title className="sr-only">{t("dialogTitle")}</Dialog.Title>
          <div className="rounded-md border border-border overflow-hidden bg-surface shadow-md">
            {/* Input bar */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
              {busy ? (
                <Loader2 className="w-4 h-4 animate-spin shrink-0 text-gold" />
              ) : (
                <Search className="w-4 h-4 shrink-0 text-text-muted" />
              )}
              <input
                ref={inputRef}
                role="combobox"
                aria-expanded={showResults}
                aria-controls="search-results-listbox"
                aria-activedescendant={
                  showResults && highlightedIndex >= 0
                    ? `search-result-${highlightedIndex}`
                    : undefined
                }
                value={query}
                onChange={(e) => {
                  const v = e.target.value;
                  setQuery(v);
                  if (!v.trim()) {
                    abortRef.current?.abort();
                    if (debounceRef.current) clearTimeout(debounceRef.current);
                    setPreviewVerse(null);
                    setSearchResults([]);
                    setRelatedResults([]);
                    setTotalResults(0);
                    setPreviewError(false);
                    setLoading(false);
                    setIsSearching(false);
                    setHighlightedIndex(-1);
                    setSelectError(false);
                    setSearchError(null);
                  }
                }}
                onKeyDown={(e) => {
                  if (showResults && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
                    e.preventDefault();
                    const delta = e.key === "ArrowDown" ? 1 : -1;
                    setHighlightedIndex((prev) => {
                      const next = prev + delta;
                      if (next < 0) return searchResults.length - 1;
                      if (next >= searchResults.length) return 0;
                      return next;
                    });
                    return;
                  }
                  if (e.key === "Enter" && showResults) {
                    if (highlightedIndex >= 0 && highlightedIndex < searchResults.length) {
                      selectResult(searchResults[highlightedIndex]);
                    } else {
                      viewAllResults();
                    }
                  }
                }}
                placeholder={t("placeholder")}
                className="flex-1 bg-transparent text-sm outline-none text-text-primary placeholder:text-text-muted"
              />
              <button
                type="button"
                onClick={query ? () => setQuery("") : onClose}
                aria-label={query ? t("clearSearch") : t("closeSearch")}
                className="text-text-muted transition-colors hover:text-text-secondary"
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
                  <p className="text-sm text-text-muted">
                    {t("verseNotFound")} <code className="font-mono text-gold">2:255</code>
                  </p>
                </div>
              )}

              {selectError && (
                <div className="px-4 py-3 text-center">
                  <p className="text-xs text-red-400">{t("somethingWentWrong")}</p>
                </div>
              )}

              {showResults && (
                <div className="p-3 space-y-0.5" role="listbox" id="search-results-listbox">
                  {uiLocale !== "en" && relatedResults.length > 0 && (
                    <p className="px-2 pb-1.5 text-[10px] text-text-muted">{t("nonEnglishHint")}</p>
                  )}
                  {searchResults.map((result, index) => (
                    <SearchResultRow
                      key={result.ref}
                      id={`search-result-${index}`}
                      result={result}
                      alreadyAdded={hasNode(result.ref)}
                      isHighlighted={index === highlightedIndex}
                      onHover={() => setHighlightedIndex(index)}
                      onSelect={() => selectResult(result)}
                    />
                  ))}
                </div>
              )}

              {showRelated && (
                <div className={cn("p-3 space-y-0.5", showResults && "border-t border-border")}>
                  <p className="px-2 pb-1.5 font-mono text-[10px] uppercase tracking-wide text-text-muted">
                    {t("relatedByMeaning")}
                  </p>
                  {relatedResults.map((result) => (
                    <SearchResultRow
                      key={result.ref}
                      id={`search-related-${result.ref}`}
                      result={result}
                      alreadyAdded={hasNode(result.ref)}
                      isHighlighted={false}
                      onHover={() => {}}
                      onSelect={() => selectResult(result)}
                    />
                  ))}
                </div>
              )}

              {!showSeedVerses &&
                !showPreview &&
                !showResults &&
                !showRelated &&
                !busy &&
                !previewError && (
                <div className="px-4 py-8 text-center">
                  <p className="text-sm text-text-muted">
                    {searchError === "rateLimited"
                      ? t("rateLimited")
                      : searchError === "unavailable"
                        ? t("searchUnavailable")
                        : t("noResults")}
                  </p>
                </div>
              )}

              {showSeedVerses && (
                <div className="p-3">
                  <p className="text-xs px-2 mb-2 font-mono text-text-muted">
                    {t("popularStartingPoints")}
                  </p>
                  <div className="space-y-0.5">
                    {SEED_VERSES.map((sv) => (
                      <button
                        key={sv.ref}
                        onClick={() => loadSeedVerse(sv.ref)}
                        disabled={busy}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors",
                          "hover:bg-surface-raised disabled:opacity-50 disabled:cursor-not-allowed"
                        )}
                      >
                        <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 bg-surface-overlay">
                          <BookOpen className="w-3.5 h-3.5 text-text-muted" />
                        </div>
                        <span className="flex-1 text-sm text-text-secondary">{sv.label}</span>
                        <span className="text-xs font-mono text-text-muted">{sv.ref}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {showResults && totalResults > searchResults.length && (
              <button
                type="button"
                onClick={viewAllResults}
                className="w-full flex items-center justify-between gap-2 border-t border-border px-4 py-2.5 text-left transition-colors hover:bg-surface-raised"
              >
                <span className="text-xs font-medium text-teal">
                  {t("viewAllResults", { count: totalResults, query: query.trim() })}
                </span>
                {highlightedIndex === -1 && (
                  <span className="flex items-center gap-1.5 text-[11px] text-text-muted">
                    {t("press")}
                    <kbd className="flex items-center gap-1 rounded border border-border bg-surface-overlay px-1.5 py-0.5 font-mono">
                      <CornerDownLeft className="w-3 h-3" /> Enter
                    </kbd>
                  </span>
                )}
              </button>
            )}
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
  const t = useTranslations("search");
  const [submitting, setSubmitting] = useState(false);

  const handleClick = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      onMapConnections();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="m-3 rounded-md border border-border p-3 space-y-3 bg-surface-raised">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-mono text-text-secondary">{verse.surahName}</span>
        <span className="text-xs font-mono px-1.5 py-0.5 rounded border shrink-0 text-gold border-gold bg-gold/10">
          {verse.ref}
        </span>
      </div>

      <p className="font-arabic text-right text-base leading-loose line-clamp-2 text-text-primary">
        {verse.arabicText}
      </p>

      <p className="text-xs leading-relaxed line-clamp-2 text-text-secondary">
        {verse.translation}
      </p>

      <Button
        variant={alreadyAdded ? "secondary" : "primary"}
        size="sm"
        onClick={handleClick}
        disabled={submitting}
        className="w-full"
      >
        {submitting ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Network className="w-3.5 h-3.5" />
        )}
        {alreadyAdded ? t("alreadyOnCanvas") : t("mapConnections")}
      </Button>
    </div>
  );
}

function SearchResultRow({
  id,
  result,
  alreadyAdded,
  isHighlighted,
  onHover,
  onSelect,
}: {
  id: string;
  result: SearchResult;
  alreadyAdded: boolean;
  isHighlighted: boolean;
  onHover: () => void;
  onSelect: () => void;
}) {
  return (
    <button
      id={id}
      role="option"
      aria-selected={isHighlighted}
      onClick={onSelect}
      onMouseEnter={onHover}
      className={cn(
        "w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left transition-colors",
        isHighlighted ? "bg-surface-raised" : "hover:bg-surface-raised"
      )}
    >
      <div className="w-8 h-8 rounded-md flex items-center justify-center shrink-0 mt-0.5 bg-surface-overlay">
        <BookOpen className="w-4 h-4 text-text-muted" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs font-mono text-gold">{result.ref}</span>
          <span className="text-xs text-text-muted">{result.surahName}</span>
        </div>
        {result.snippet && (
          <p className="text-xs leading-relaxed line-clamp-2 text-text-secondary">
            {result.snippet}
          </p>
        )}
      </div>
      <Network
        className={cn("w-3.5 h-3.5 shrink-0 mt-1", alreadyAdded ? "text-teal" : "text-text-muted")}
      />
    </button>
  );
}
