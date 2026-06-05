"use client";

import * as RadixTooltip from "@radix-ui/react-tooltip";
import { type ReactNode } from "react";

/**
 * Styled tooltip replacing native `title` on icon-only controls. Wrap the app
 * (or a subtree) in <TooltipProvider> once; use <Tooltip label="…"> per control.
 */
export const TooltipProvider = RadixTooltip.Provider;

export function Tooltip({
  label,
  children,
  side = "bottom",
}: {
  label: string;
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
}) {
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          sideOffset={6}
          className="z-50 select-none rounded-md border border-border bg-surface-overlay px-2.5 py-1.5 text-xs text-text-primary shadow-sm data-[state=delayed-open]:animate-[fadeIn_120ms_ease-out]"
        >
          {label}
          <RadixTooltip.Arrow className="fill-[var(--color-surface-overlay)]" />
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
