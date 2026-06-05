"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { Header } from "@/components/layout/Header";
import { SearchDialog } from "@/components/search/SearchDialog";
import { EmptyState } from "@/components/canvas/EmptyState";
import { ContextSidebar } from "@/components/layout/ContextSidebar";
import { useCanvasStore } from "@/store/canvas";
import { findFreeSlot } from "@/lib/canvas-layout";
import type { Verse } from "@/types/quran";

const HikmahCanvas = dynamic(
  () => import("@/components/canvas/HikmahCanvas").then((m) => m.HikmahCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center">
        <div className="text-xs font-mono tracking-wider uppercase text-text-muted">
          Loading canvas…
        </div>
      </div>
    ),
  }
);

function VerseLoader() {
  const searchParams = useSearchParams();
  const addVerseNode = useCanvasStore((s) => s.addVerseNode);
  const setPendingAutoExpand = useCanvasStore((s) => s.setPendingAutoExpand);
  const handledRef = useRef<string | null>(null);

  useEffect(() => {
    const verseRef = searchParams.get("verse");
    if (!verseRef || handledRef.current === verseRef) return;
    if (!/^\d+:\d+$/.test(verseRef)) return;

    handledRef.current = verseRef;
    const [surah, ayah] = verseRef.split(":");

    fetch(`/api/verse/${surah}/${ayah}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((verse: Verse | null) => {
        if (!verse) return;
        // Usually a fresh canvas (origin), but if one was restored from storage,
        // drop the incoming verse into free space instead of onto an existing node.
        const existing = useCanvasStore.getState().nodes.map((n) => n.position);
        const pos = existing.length === 0 ? { x: 0, y: 0 } : findFreeSlot(existing, { x: 0, y: 0 });
        const nodeId = addVerseNode({ ...verse, isRoot: true }, pos);
        setPendingAutoExpand(nodeId);
        const url = new URL(window.location.href);
        url.searchParams.delete("verse");
        window.history.replaceState(null, "", url.toString());
      })
      .catch(() => {});
  }, [searchParams, addVerseNode, setPendingAutoExpand]);

  return null;
}

export default function CanvasPage() {
  const [searchOpen, setSearchOpen] = useState(false);
  const nodes = useCanvasStore((s) => s.nodes);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target.isContentEditable;

      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        if (isInput) return;
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === "Escape" && !isInput) {
        setSearchOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-bg">
      <Suspense>
        <VerseLoader />
      </Suspense>

      <Header onSearchOpen={() => setSearchOpen(true)} />

      <main className="flex-1 relative overflow-hidden">
        {nodes.length === 0 && (
          <EmptyState onSearchOpen={() => setSearchOpen(true)} />
        )}
        <HikmahCanvas />
        <ContextSidebar />
      </main>

      <SearchDialog
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
      />
    </div>
  );
}
