"use client";

import { useCallback, useState } from "react";
import type { FeedbackTone } from "./Feedback";

export interface ActionMessage {
  tone: FeedbackTone;
  text: string;
}

/**
 * The standard feedback slot for an imperative admin handler (save / clear /
 * run). Keeps the tone attached to the text so the render can't accidentally
 * show a failure in the success colour. Render `message` through `<Feedback>`.
 * `Feedback` is itself a live region (status / alert), so the result is
 * announced once, by the element that shows it.
 */
export function useActionMessage() {
  const [message, setMessage] = useState<ActionMessage | null>(null);

  const ok = useCallback((text: string) => setMessage({ tone: "success", text }), []);
  const fail = useCallback((text: string) => setMessage({ tone: "error", text }), []);
  const info = useCallback((text: string) => setMessage({ tone: "info", text }), []);
  const clear = useCallback(() => setMessage(null), []);

  return { message, ok, fail, info, clear };
}
