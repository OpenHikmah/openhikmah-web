"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button, type ButtonProps } from "@/components/ui";

/** A compact dashboard stat: a label, a large gold value, and optional hint. */
export function StatTile({
  label,
  value,
  hint,
  tone = "gold",
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "gold" | "teal" | "plain";
}) {
  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-3.5">
      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted">
        {label}
      </div>
      <div
        className={cn(
          "mt-1.5 text-2xl font-semibold tabular-nums",
          tone === "gold" && "text-gold",
          tone === "teal" && "text-teal",
          tone === "plain" && "text-text-primary"
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-0.5 text-xs text-text-muted">{hint}</div>}
    </div>
  );
}

/** A small status badge. Colour conveys state; never the only signal (text too). */
export function Pill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "active" | "flagged" | "retired" | "neutral";
}) {
  const tones: Record<string, string> = {
    active: "border-teal/40 bg-teal/10 text-teal",
    flagged: "border-gold-muted bg-gold/10 text-gold",
    retired: "border-border bg-white/5 text-text-muted",
    neutral: "border-border bg-white/5 text-text-secondary",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-wide",
        tones[tone]
      )}
    >
      {children}
    </span>
  );
}

// ─── Table primitives ─────────────────────────────────────────────────────────

export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}

export function Th({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={cn(
        "border-b border-border bg-surface px-3.5 py-2.5 text-left font-mono text-[10px] font-normal uppercase tracking-[0.14em] text-text-muted",
        className
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <td className={cn("border-b border-border-subtle px-3.5 py-2.5 align-middle", className)}>
      {children}
    </td>
  );
}

/**
 * A button that requires a second click to confirm a destructive/irreversible
 * action. The first click flips the label to a warning; a second within the
 * window runs `onConfirm`. Cheaper than a modal for a one-operator console.
 */
export function ConfirmButton({
  onConfirm,
  children,
  confirmLabel = "Confirm?",
  variant = "danger",
  size = "sm",
  ...props
}: {
  onConfirm: () => void;
  children: React.ReactNode;
  confirmLabel?: string;
} & Omit<ButtonProps, "onClick">) {
  const [armed, setArmed] = useState(false);

  return (
    <Button
      variant={armed ? "danger" : variant}
      size={size}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else {
          setArmed(true);
          window.setTimeout(() => setArmed(false), 3000);
        }
      }}
      {...props}
    >
      {armed ? confirmLabel : children}
    </Button>
  );
}

/** Centred non-blocking states for async module content. */
export function StateNote({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "muted" | "error";
}) {
  return (
    <p
      className={cn(
        "px-1 py-8 text-center text-sm",
        tone === "error" ? "text-error" : "text-text-muted"
      )}
    >
      {children}
    </p>
  );
}
