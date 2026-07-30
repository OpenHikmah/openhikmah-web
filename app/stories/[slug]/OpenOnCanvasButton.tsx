"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Network } from "lucide-react";
import { buttonVariants } from "@/components/ui";
import { useCanvasStore } from "@/store/canvas";
import { cn } from "@/lib/utils";
import type { Verse } from "@/types/quran";

/**
 * Per-chapter "Open on canvas" action. Receives verses already resolved by the
 * server page (no extra fetch). The canvas store is a global singleton that
 * survives SPA navigation (same mechanism SearchDialog uses to add nodes
 * cross-surface) — nodes added here are still present once /canvas mounts, and
 * useCanvasPersistence's localStorage restore no-ops whenever nodes.length > 0.
 */
export function OpenOnCanvasButton({ verses, label }: { verses: Verse[]; label?: string }) {
  const [pending, setPending] = useState(false);
  const router = useRouter();

  const handleClick = () => {
    setPending(true);
    const { hasNode, addVerseNode } = useCanvasStore.getState();
    for (const verse of verses) {
      if (hasNode(verse.ref)) continue;
      addVerseNode(verse);
    }
    router.push("/canvas");
  };

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      className={cn(buttonVariants({ variant: "primary", size: "md" }), "gap-2")}
    >
      <Network className="h-4 w-4" />
      {label ?? "Open on canvas"}
    </button>
  );
}
