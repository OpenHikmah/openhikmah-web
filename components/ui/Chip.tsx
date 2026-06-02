import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * A one-tap suggestion / filter (e.g. curated starting points: Patience, Mercy).
 * Quiet by default, gold on hover. Use for low-commitment navigation, not
 * primary actions.
 */
export type ChipProps = ButtonHTMLAttributes<HTMLButtonElement>;

export const Chip = forwardRef<HTMLButtonElement, ChipProps>(
  ({ className, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center rounded-md border border-border bg-surface px-4 py-2 text-sm text-text-primary transition-[color,border-color] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] hover:border-gold-muted hover:text-gold",
        className
      )}
      {...props}
    />
  )
);
Chip.displayName = "Chip";
