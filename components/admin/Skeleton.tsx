/**
 * Loading placeholders for admin list content. `SkeletonRows` replaces the bare
 * "Loading…" note on the list pages so the layout doesn't jump when data lands.
 */
import { cn } from "@/lib/utils";

export function SkeletonRows({ n = 6, className }: { n?: number; className?: string }) {
  return (
    <>
      {/* The pulsing bars are decorative; assistive tech gets a plain status. */}
      <span role="status" className="sr-only">
        Loading…
      </span>
      <div className={cn("space-y-2", className)} aria-hidden>
        {Array.from({ length: n }, (_, i) => (
          <div key={i} className="h-9 animate-pulse rounded bg-white/5" />
        ))}
      </div>
    </>
  );
}

/** Placeholder grid matching the `StatTile` dashboard rows (Overview, AI, Analytics). */
export function SkeletonTiles({ n = 4, className }: { n?: number; className?: string }) {
  return (
    <>
      <span role="status" className="sr-only">
        Loading…
      </span>
      <div
        className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4", className)}
        aria-hidden
      >
        {Array.from({ length: n }, (_, i) => (
          <div
            key={i}
            className="h-[86px] animate-pulse rounded-lg border border-border bg-white/5"
          />
        ))}
      </div>
    </>
  );
}
