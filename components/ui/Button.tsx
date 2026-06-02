import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * The one text-button in the app, with a real hierarchy:
 *   primary   — the single main action in a context (filled gold, ink text)
 *   secondary — outline, gold-on-hover (nav, secondary actions)
 *   ghost     — text-only for low-stakes / dismissive actions
 *   danger    — destructive only
 * Resting states are legible; hover adds a soft wash; focus uses the global ring.
 */
const button = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-[color,background-color,border-color,filter] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        primary: "bg-gold font-semibold text-[#1a1305] hover:brightness-110 active:brightness-95",
        secondary:
          "border border-border text-text-primary hover:border-gold-muted hover:bg-white/5",
        ghost: "text-text-secondary hover:bg-white/5 hover:text-text-primary",
        danger: "border border-border text-error hover:border-error/40 hover:bg-error/10",
      },
      size: {
        sm: "h-8 px-3 text-[13px]",
        md: "h-10 px-4 text-sm",
        lg: "h-11 px-5 text-[15px]",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(button({ variant, size }), className)} {...props} />
  )
);
Button.displayName = "Button";

export { button as buttonVariants };
