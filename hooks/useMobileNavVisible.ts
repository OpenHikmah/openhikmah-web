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

  // Mirrors MobileNavBar's own hideMobileTabs condition: hidden only on a
  // populated canvas, where the Header's mobile action bar takes over instead.
  const hideMobileTabs = pathname === "/canvas" && nodeCount > 0;
  return !hideMobileTabs;
}
