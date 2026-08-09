"use client";

import { useEffect, useRef, useState } from "react";
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
  const mountedRef = useRef(true);
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
    };
  }, []);

  const handleClick = () => {
    setPending(true);
    try {
      const { hasNode, addVerseNode } = useCanvasStore.getState();
      for (const verse of verses) {
        if (hasNode(verse.ref)) continue;
        addVerseNode(verse);
      }
      router.push("/canvas");
    } catch {
      if (mountedRef.current) setPending(false);
      return;
    }
    // router.push normally unmounts this component before it matters. If
    // navigation is interrupted (blocked, cancelled) the component survives
    // with `pending` stuck true and no way to retry — unstick it after a
    // grace period long enough that it never fires during a normal navigation.
    resetTimeoutRef.current = setTimeout(() => {
      if (mountedRef.current) setPending(false);
    }, 4000);
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
