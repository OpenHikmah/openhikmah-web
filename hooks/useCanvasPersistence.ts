"use client";

import { useEffect, useRef } from "react";
import { useCanvasStore, serializeCanvas, type SavedCanvas } from "@/store/canvas";

const LS_KEY = "open-hikmah-canvas";

export async function buildShareUrl(canvas: SavedCanvas): Promise<string> {
  const res = await fetch("/api/share", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(canvas),
  });
  if (!res.ok) throw new Error("Share failed");
  const { id } = await res.json() as { id: string };
  const url = new URL(window.location.href);
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  url.searchParams.set("share", id);
  return url.toString();
}

export function useCanvasPersistence() {
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const restoreCanvas = useCanvasStore((s) => s.restoreCanvas);
  const hydratedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // On mount: restore from ?share=<id> first, then localStorage
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const shareId = params.get("share");

    if (shareId && /^[a-f0-9]{10}$/.test(shareId)) {
      // Clean the share param from URL immediately so refreshing doesn't re-fetch
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete("share");
      window.history.replaceState(null, "", cleanUrl.toString());

      fetch(`/api/share/${shareId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((saved: SavedCanvas | null) => {
          if (saved?.v === 1 && saved.nodes.length > 0) {
            restoreCanvas(saved);
          }
        })
        .catch(() => {});
      return;
    }

    // Fall back to localStorage
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const saved: SavedCanvas = JSON.parse(raw);
        if (saved?.v === 1 && saved.nodes.length > 0) {
          restoreCanvas(saved);
        }
      }
    } catch {
      // Corrupt localStorage — ignore
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save to localStorage whenever nodes/edges change (debounced 800ms)
  useEffect(() => {
    if (!hydratedRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      try {
        if (nodes.length === 0) {
          localStorage.removeItem(LS_KEY);
        } else {
          localStorage.setItem(LS_KEY, JSON.stringify(serializeCanvas(nodes, edges)));
        }
      } catch {
        // localStorage quota exceeded — ignore
      }
    }, 800);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [nodes, edges]);
}
