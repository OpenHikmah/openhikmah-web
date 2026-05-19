"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { Header } from "@/components/layout/Header";
import { SearchDialog } from "@/components/search/SearchDialog";
import { EmptyState } from "@/components/canvas/EmptyState";
import { ContextSidebar } from "@/components/layout/ContextSidebar";
import { useCanvasStore } from "@/store/canvas";

const HikmahCanvas = dynamic(
  () => import("@/components/canvas/HikmahCanvas").then((m) => m.HikmahCanvas),
  { ssr: false }
);

export default function Home() {
  const [searchOpen, setSearchOpen] = useState(false);
  const nodes = useCanvasStore((s) => s.nodes);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === "Escape") setSearchOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden geometric-bg">
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
