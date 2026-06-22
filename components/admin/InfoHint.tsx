"use client";

import * as RadixTooltip from "@radix-ui/react-tooltip";
import { Info } from "lucide-react";

/**
 * A small "i" icon that reveals an explanation on hover/focus — for the top-right
 * of admin stat tiles/cards whose meaning isn't self-evident. Relies on the app's
 * root <TooltipProvider> (admin pages render under it).
 */
export function InfoHint({ text }: { text: string }) {
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>
        <button
          type="button"
          aria-label="What is this?"
          className="shrink-0 cursor-help text-text-muted transition-colors hover:text-text-secondary focus:text-text-secondary focus:outline-none"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side="top"
          align="end"
          sideOffset={6}
          collisionPadding={8}
          className="z-50 max-w-[240px] select-none rounded-md border border-border bg-surface-overlay px-2.5 py-2 text-xs leading-relaxed text-text-secondary shadow-floating data-[state=delayed-open]:animate-[fadeIn_120ms_ease-out]"
        >
          {text}
          <RadixTooltip.Arrow className="fill-[var(--color-surface-overlay)]" />
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
