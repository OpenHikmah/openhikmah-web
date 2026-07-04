import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * A container with a real elevation hierarchy — all on the palette, no inline styles:
 *   base     — quiet surface fill + subtle border, flat (the default; the canvas stays flat)
 *   raised   — a nested panel on a darker parent (e.g. sidebar sections), still flat
 *   floating — a surface that genuinely floats (popovers/menus/dialogs): soft shadow
 * Pass `interactive` for a hover state on clickable cards.
 */
const card = cva("rounded-lg border border-border", {
  variants: {
    variant: {
      base: "bg-surface",
      raised: "bg-surface-raised",
      floating: "bg-surface-overlay shadow-floating",
    },
    interactive: {
      true: "cursor-pointer transition-[border-color,background-color] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] hover:border-gold-muted hover:bg-surface-raised",
      false: "",
    },
  },
  defaultVariants: { variant: "base", interactive: false },
});

export interface CardProps extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof card> {}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, interactive, ...props }, ref) => (
    <div ref={ref} className={cn(card({ variant, interactive }), className)} {...props} />
  )
);
Card.displayName = "Card";

export { card as cardVariants };
