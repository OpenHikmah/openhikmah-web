import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** Standard text input: solid border, simple focus (global ring), no animated underlines. */
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary placeholder:text-text-muted transition-[border-color] duration-[120ms] hover:border-border-subtle focus:border-gold-muted",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";
