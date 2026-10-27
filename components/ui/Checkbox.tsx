import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** Native checkbox on the shared tokens: gold accent, visible focus ring, disabled state. */
export const Checkbox = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, "type">
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    type="checkbox"
    className={cn(
      "h-4 w-4 shrink-0 cursor-pointer rounded border-border bg-surface accent-gold disabled:cursor-not-allowed disabled:opacity-60",
      className
    )}
    {...props}
  />
));
Checkbox.displayName = "Checkbox";
