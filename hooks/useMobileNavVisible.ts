"use client";

import { usePathname } from "next/navigation";
import { useCanvasStore } from "@/store/canvas";

/**
 * Whether MobileNavBar is currently rendering its fixed bottom tab bar (on
 * viewports below `md`). Shared with MiniPlayer, which needs to offset itself
 * above the bar instead of overlapping it — kept in one place so the two
 * components' visibility can't drift out of sync.
 */
export function useMobileNavVisible(): boolean {
  const pathname = usePathname();
  const nodeCount = useCanvasStore((s) => s.nodes.length);

  // Hidden only once the canvas has nodes — that's when the Header's mobile
  // action bar takes over the bottom edge (and the two fixed bars would
  // otherwise collide). On an empty canvas the tabs stay, so mobile users can
  // still navigate away (the EmptyState is centred and isn't obscured).
  const hideMobileTabs = pathname === "/canvas" && nodeCount > 0;
  return !hideMobileTabs;
}
