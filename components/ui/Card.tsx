import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * A quiet container: surface fill + subtle border, modest radius. No shadow by
 * default (the canvas stays flat; shadows are reserved for floating things).
 * Pass `interactive` for a hover state on clickable cards.
 */
export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, interactive, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-lg border border-border bg-surface",
        interactive &&
          "transition-[border-color,background-color] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] hover:border-gold-muted hover:bg-surface-raised",
        className
      )}
      {...props}
    />
  )
);
Card.displayName = "Card";
