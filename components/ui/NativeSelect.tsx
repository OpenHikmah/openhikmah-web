import { forwardRef, type SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A native `<select>` styled to match `Input` — same border/focus tokens, a
 * chevron affordance. Use this for dense admin forms where the Radix `Select`
 * (portalled listbox) is overkill or awkward (e.g. inside a table cell); reach
 * for `Select` when you need rich option content or full styling control.
 */
export const NativeSelect = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          "h-10 w-full appearance-none rounded-md border border-border bg-surface pl-3 pr-9 text-sm text-text-primary transition-[border-color] duration-[120ms] hover:border-border-subtle focus:border-gold-muted disabled:opacity-60",
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
    </div>
  )
);
NativeSelect.displayName = "NativeSelect";
