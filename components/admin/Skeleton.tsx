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
