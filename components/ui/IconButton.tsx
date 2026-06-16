import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * Square icon-only control. Resting color is `secondary` (legible before
 * interaction); hover adds a soft wash and brightens; semantic tones add the
 * matching gold/teal wash + border. Always pair with a <Tooltip> for a label —
 * never rely on a native title. Keep a ≥44px hit area via the wrapper when 32px.
 */
const iconButton = cva(
  "inline-flex items-center justify-center rounded-md border transition-[color,background-color,border-color,transform] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] active:scale-95 disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      tone: {
        neutral:
          "border-border text-text-secondary hover:bg-white/5 hover:text-text-primary active:bg-white/10",
        gold: "border-border text-text-secondary hover:border-gold-muted hover:bg-gold/10 hover:text-gold",
        teal: "border-border text-text-secondary hover:border-teal hover:bg-teal/15 hover:text-teal",
        danger:
          "border-border text-text-secondary hover:border-error/40 hover:bg-error/10 hover:text-error",
      },
      size: {
        xs: "h-7 w-7 [&_svg]:size-3.5",
        sm: "h-8 w-8 [&_svg]:size-4",
        md: "h-9 w-9 [&_svg]:size-[17px]",
      },
    },
    defaultVariants: { tone: "neutral", size: "md" },
  }
);

export interface IconButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof iconButton> {}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, tone, size, ...props }, ref) => (
    <button ref={ref} className={cn(iconButton({ tone, size }), className)} {...props} />
  )
);
IconButton.displayName = "IconButton";

export { iconButton as iconButtonVariants };
