"use client";

import { useEffect, useRef } from "react";
import { useCanvasStore, serializeCanvas, type SavedCanvas } from "@/store/canvas";

/** localStorage key for the in-progress canvas. Exported so the home screen can
 *  surface a "continue where you left off" entry without re-deriving the key. */
export const CANVAS_STORAGE_KEY = "open-hikmah-canvas";
const LS_KEY = CANVAS_STORAGE_KEY;

export async function buildShareUrl(canvas: SavedCanvas): Promise<string> {
  const res = await fetch("/api/share", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(canvas),
  });
  if (!res.ok) throw new Error("Share failed");
  const { id } = (await res.json()) as { id: string };
  const url = new URL(window.location.href);
  // Point at the canvas — that's where the share is restored (see the mount
  // effect below). A "/" link would just land on the marketing page.
  url.pathname = "/canvas";
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

  function tryRestoreFromLocalStorage() {
    // Skip if the store was already populated (e.g. by a workspace load that
    // happened before this canvas mount) so we don't overwrite it.
    if (useCanvasStore.getState().nodes.length > 0) return;
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
  }

  // On mount: restore from ?share=<id> first, then localStorage
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const shareId = params.get("share");

    if (shareId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(shareId)) {
      fetch(`/api/share/${shareId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((saved: SavedCanvas | null) => {
          if (saved?.v === 1 && saved.nodes.length > 0) {
            restoreCanvas(saved);
            // Only clean the URL once we've successfully restored — preserves the
            // share link for retry if the fetch fails or returns invalid data.
            const cleanUrl = new URL(window.location.href);
            cleanUrl.searchParams.delete("share");
            window.history.replaceState(null, "", cleanUrl.toString());
          } else {
            tryRestoreFromLocalStorage();
          }
        })
        .catch(() => {
          tryRestoreFromLocalStorage();
        });
      return;
    }

    tryRestoreFromLocalStorage();
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
