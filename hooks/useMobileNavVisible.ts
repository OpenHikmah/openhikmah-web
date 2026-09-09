"use client";

import { usePathname } from "next/navigation";
import { useCanvasStore } from "@/store/canvas";

/**
 * Whether MobileNavBar is currently rendering its fixed bottom tab bar (on
 * viewports below `md`). Shared with MiniPlayer, which needs to offset itself
 * above the bar instead of overlapping it — kept in one place so the two
 * components' visibility can't drift out of sync.
 *
 * The tabs are hidden only once the canvas has nodes — that's when the Header's
 * mobile action bar takes over the bottom edge (and the two fixed bars would
 * otherwise collide). On an empty canvas the tabs stay, so mobile users can
 * still navigate away (the EmptyState is centred and isn't obscured).
 */
export function useMobileNavVisible(): boolean {
  const onCanvas = usePathname() === "/canvas";

  // Fold the route check into the selector so it returns a constant `false` off
  // canvas: this hook feeds the app-wide MiniPlayer (and per-route MobileNavBar),
  // and without the guard every canvas node add/remove would re-render them on
  // routes where the node count is irrelevant.
  const canvasHasNodes = useCanvasStore((s) => onCanvas && s.nodes.length > 0);

  return !canvasHasNodes;
}
