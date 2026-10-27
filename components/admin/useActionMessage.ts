"use client";

import { useCallback, useState } from "react";
import { useAdminAnnounce } from "./AdminLiveRegion";
import type { FeedbackTone } from "./Feedback";

export interface ActionMessage {
  tone: FeedbackTone;
  text: string;
}

/**
 * The standard feedback slot for an imperative admin handler (save / clear /
 * run). Keeps the tone attached to the text so the render can't accidentally
 * show a failure in the success colour. Render `message` through `<Feedback>`.
 * Every message is also announced to screen readers through the admin live
 * region, so sighted and assistive-tech users get the same result.
 */
export function useActionMessage() {
  const announce = useAdminAnnounce();
  const [message, setMessage] = useState<ActionMessage | null>(null);

  const show = useCallback(
    (tone: FeedbackTone, text: string) => {
      setMessage({ tone, text });
      announce(text);
    },
    [announce]
  );

  const ok = useCallback((text: string) => show("success", text), [show]);
  const fail = useCallback((text: string) => show("error", text), [show]);
  const info = useCallback((text: string) => show("info", text), [show]);
  const clear = useCallback(() => setMessage(null), []);

  return { message, ok, fail, info, clear };
}
