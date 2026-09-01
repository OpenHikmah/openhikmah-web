import { cn } from "@/lib/utils";

export type FeedbackTone = "success" | "error" | "info";

/**
 * Inline result of an imperative admin action (save / clear / run a job). Unlike
 * `StateNote` (async-load and empty states), a failure here must never look like
 * a success — the tone drives the colour and the live-region politeness.
 */
export function Feedback({
  tone,
  children,
  className,
}: {
  tone: FeedbackTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      role="status"
      aria-live={tone === "error" ? "assertive" : "polite"}
      className={cn(
        "text-xs",
        tone === "success" && "text-teal",
        tone === "error" && "text-error",
        tone === "info" && "text-text-muted",
        className
      )}
    >
      {children}
    </p>
  );
}
