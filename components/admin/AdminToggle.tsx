"use client";

import { cn } from "@/lib/utils";

export interface ToggleOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

/**
 * The one segmented control for the admin console: filter rows (Connections,
 * Challenges moderation), the Challenges section switch, the Prompts slot
 * picker. Each choice is a real `aria-pressed` button inside a `role="group"`.
 * Colour marks the active choice; the label text is always present too.
 */
export function AdminToggle<T extends string>({
  options,
  value,
  onChange,
  label,
  size = "sm",
}: {
  options: readonly ToggleOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Optional leading caption (e.g. "Status"). */
  label?: string;
  size?: "sm" | "md";
}) {
  return (
    <div className="flex items-center gap-2" role="group" aria-label={label}>
      {label && (
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
          {label}
        </span>
      )}
      <div className="flex gap-1">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded border transition-colors disabled:opacity-40",
              size === "sm" ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm",
              value === o.value
                ? "border-gold-muted bg-gold/10 text-gold"
                : "border-border text-text-secondary hover:border-gold-muted"
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
