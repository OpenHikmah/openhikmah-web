"use client";

import { cn } from "@/lib/utils";
import { Button, type ButtonProps } from "@/components/ui";
import { useArmedConfirm } from "@/hooks/useArmedConfirm";
import { InfoHint } from "./InfoHint";

/** A compact dashboard stat: a label, a large gold value, and optional hint. An
 *  `info` string adds a hover "i" explanation in the top-right corner. */
export function StatTile({
  label,
  value,
  hint,
  tone = "gold",
  info,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "gold" | "teal" | "plain";
  info?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted">
          {label}
        </div>
        {info && <InfoHint text={info} />}
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

/** The one card surface for admin settings/editor blocks — single padding scale. */
export function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-lg border border-border bg-surface p-5", className)}>
      {children}
    </section>
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
  scope = "col",
}: {
  children?: React.ReactNode;
  className?: string;
  scope?: React.ThHTMLAttributes<HTMLTableCellElement>["scope"];
}) {
  return (
    <th
      scope={scope}
      className={cn(
        "border-b border-border bg-surface px-3.5 py-2.5 text-left font-mono text-[10px] font-normal uppercase tracking-[0.14em] text-text-muted",
        className
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
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
  // `variant` is the resting look; the button always turns `danger` once armed,
  // so a non-destructive default (e.g. a "Create & activate" primary) works too.
  const { armed, trigger } = useArmedConfirm(onConfirm);

  return (
    <Button variant={armed ? "danger" : variant} size={size} onClick={trigger} {...props}>
      {armed ? confirmLabel : children}
    </Button>
  );
}

/**
 * The standard "Load more" control for a `usePaginated` list: one button, one
 * error copy. Renders nothing when there's no next page.
 */
export function LoadMore({
  hasMore,
  loading,
  error,
  onClick,
}: {
  hasMore: boolean;
  loading: boolean;
  error: boolean;
  onClick: () => void;
}) {
  if (!hasMore) return null;
  return (
    <div className="flex flex-col items-center gap-2">
      <Button variant="secondary" size="sm" onClick={onClick} disabled={loading}>
        {loading ? "Loading…" : "Load more"}
      </Button>
      {error && <StateNote tone="error">Couldn&apos;t load more.</StateNote>}
    </div>
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
