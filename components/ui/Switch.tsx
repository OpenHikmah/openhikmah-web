"use client";

import * as RadixSwitch from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
  "aria-label"?: string;
}

export function Switch({
  checked,
  onCheckedChange,
  disabled,
  className,
  id,
  "aria-label": ariaLabel,
}: SwitchProps) {
  return (
    <RadixSwitch.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      id={id}
      aria-label={ariaLabel}
      className={cn(
        "relative h-6 w-10 shrink-0 rounded-full border border-border bg-surface transition-colors duration-[120ms] data-[state=checked]:border-gold-muted data-[state=checked]:bg-gold disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
    >
      <RadixSwitch.Thumb className="block size-4 translate-x-0.5 rounded-full bg-text-secondary transition-transform duration-[120ms] data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-ink" />
    </RadixSwitch.Root>
  );
}
