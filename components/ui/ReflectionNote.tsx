import { type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * AI-articulated or editorial text that must be VISUALLY DISTINCT from canonical
 * Quran text — a teal-bordered, labelled aside. Used for connection "why"
 * explanations and curated reflections. Never style canonical verse text this
 * way, and never style this as canonical text.
 */
export function ReflectionNote({
  label = "Reflection",
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { label?: string }) {
  return (
    <div
      className={cn("border-l-2 border-teal bg-teal/[0.06] rounded-r-md px-4 py-3", className)}
      {...props}
    >
      <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-teal">
        {label}
      </div>
      <div className="text-sm leading-relaxed text-text-secondary">{children}</div>
    </div>
  );
}
