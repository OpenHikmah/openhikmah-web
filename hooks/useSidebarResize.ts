"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCanvasStore, DEFAULT_SIDEBAR_WIDTH } from "@/store/canvas";

const MIN_WIDTH = DEFAULT_SIDEBAR_WIDTH;
const MAX_WIDTH_CAP = 720;
const MAX_WIDTH_VIEWPORT_RATIO = 0.6;

/**
 * Drag-to-resize for the right-anchored ContextSidebar. The panel is pinned to
 * the screen's right edge, so dragging the handle left must widen it — width
 * grows by the negative of the pointer's deltaX from drag start.
 */
export function useSidebarResize() {
  const width = useCanvasStore((s) => s.sidebarWidth);
  const setSidebarWidth = useCanvasStore((s) => s.setSidebarWidth);
  const [isResizing, setIsResizing] = useState(false);
  const dragStartRef = useRef({ x: 0, width: 0 });

  useEffect(() => {
    if (!isResizing) return;

    const handleMove = (e: PointerEvent) => {
      const maxWidth = Math.min(MAX_WIDTH_CAP, window.innerWidth * MAX_WIDTH_VIEWPORT_RATIO);
      const delta = e.clientX - dragStartRef.current.x;
      const next = Math.min(maxWidth, Math.max(MIN_WIDTH, dragStartRef.current.width - delta));
      setSidebarWidth(next);
    };
    const handleUp = () => setIsResizing(false);

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    const prevUserSelect = document.body.style.userSelect;
    const prevCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      document.body.style.userSelect = prevUserSelect;
      document.body.style.cursor = prevCursor;
    };
  }, [isResizing, setSidebarWidth]);

  const onHandlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      dragStartRef.current = { x: e.clientX, width };
      setIsResizing(true);
    },
    [width]
  );

  return { width, onHandlePointerDown, isResizing };
}
