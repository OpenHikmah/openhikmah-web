"use client";

import { useEffect, useRef } from "react";
import { useCanvasStore, serializeCanvas, type SavedCanvas } from "@/store/canvas";

const LS_KEY = "open-hikmah-canvas";

function encode(canvas: SavedCanvas): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(canvas))));
}

function decode(s: string): SavedCanvas | null {
  try {
    return JSON.parse(decodeURIComponent(escape(atob(s)))) as SavedCanvas;
  } catch {
    return null;
  }
}

export function buildShareUrl(canvas: SavedCanvas): string {
  const url = new URL(window.location.href);
  url.pathname = "/";
  url.searchParams.delete("verse");
  url.hash = `canvas=${encode(canvas)}`;
  return url.toString();
}

export function useCanvasPersistence() {
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const restoreCanvas = useCanvasStore((s) => s.restoreCanvas);
  const hydratedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // On mount: restore from URL hash first, then localStorage
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;

    // Check URL hash for shared canvas
    const hash = window.location.hash;
    const match = hash.match(/canvas=([^&]+)/);
    if (match) {
      const saved = decode(match[1]);
      if (saved?.v === 1 && saved.nodes.length > 0) {
        restoreCanvas(saved);
        // Clean the hash from URL without reload
        const url = new URL(window.location.href);
        url.hash = "";
        window.history.replaceState(null, "", url.toString());
        return;
      }
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
