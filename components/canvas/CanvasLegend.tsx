"use client";

/**
 * A quiet, always-visible key for the three connection kinds, so the edge colors
 * on the canvas are self-explanatory. Sits in a corner; hidden on the narrowest
 * screens where canvas space is scarce.
 */
const ITEMS: Array<{ label: string; className: string }> = [
  { label: "Theme", className: "bg-theme-edge" },
  { label: "Root", className: "bg-root-edge" },
  { label: "Contrast", className: "bg-contrast-edge" },
];

export function CanvasLegend() {
  return (
    <div className="hidden items-center gap-3 rounded-md border border-border bg-surface/80 px-3 py-1.5 backdrop-blur-sm sm:flex">
      {ITEMS.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5">
          <span className={`h-0.5 w-3.5 rounded-full ${item.className}`} />
          <span className="text-[11px] text-text-secondary">{item.label}</span>
        </div>
      ))}
    </div>
  );
}
