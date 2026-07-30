"use client";

import { useTranslations } from "next-intl";

// Shared by Header.tsx's MoreSheet (mobile overflow), so the edge-color key
// only needs its (message key, color) pairing defined once.
export const CANVAS_LEGEND_ITEMS = [
  { key: "legendTheme", className: "bg-theme-edge" },
  { key: "legendRoot", className: "bg-root-edge" },
  { key: "legendContrast", className: "bg-contrast-edge" },
] as const;

/**
 * A quiet, always-visible key for the three connection kinds, so the edge colors
 * on the canvas are self-explanatory. Sits in a corner; hidden on the narrowest
 * screens where canvas space is scarce.
 */
export function CanvasLegend() {
  const t = useTranslations("canvas");

  return (
    <div className="hidden items-center gap-3 rounded-md border border-border bg-surface/80 px-3 py-1.5 backdrop-blur-sm sm:flex">
      {CANVAS_LEGEND_ITEMS.map((item) => (
        <div key={item.key} className="flex items-center gap-1.5">
          <span className={`h-0.5 w-3.5 rounded-full ${item.className}`} />
          <span className="text-[11px] text-text-secondary">{t(item.key)}</span>
        </div>
      ))}
    </div>
  );
}
