import { cn } from "@/lib/utils";
import type { ActionMessage } from "./useActionMessage";

export type FeedbackTone = "success" | "error" | "info";

/**
 * Inline result of an imperative admin action (save / clear / run a job). Unlike
 * `StateNote` (async-load and empty states), a failure here must never look like
 * a success — the tone drives the colour and the live-region role.
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
      role={tone === "error" ? "alert" : "status"}
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

/**
 * Renders an `ActionMessage` slot. The polite `role="status"` region stays
 * mounted (empty) so a success set later is announced as a text change — a
 * live region that mounts already filled is often missed by screen readers.
 * Errors stay a conditionally rendered `role="alert"`.
 */
export function ActionFeedback({ message }: { message: ActionMessage | null }) {
  const isError = message?.tone === "error";
  return (
    <>
      <p
        role="status"
        aria-live="polite"
        className={cn(
          "text-xs empty:my-0",
          message?.tone === "success" && "text-teal",
          message?.tone === "info" && "text-text-muted"
        )}
      >
        {message && !isError ? message.text : null}
      </p>
      {message && isError && <Feedback tone="error">{message.text}</Feedback>}
    </>
  );
}
