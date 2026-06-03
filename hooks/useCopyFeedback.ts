"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Copy text to the clipboard and flash a `copied` flag for `resetMs` (default
 * 2s). Shared by the controls that copy a shareable link — the canvas Share
 * button and the Verse-of-the-Day Share button. Fails silently (returns false)
 * when the clipboard API is unavailable, mirroring the previous inline behavior.
 */
export function useCopyFeedback(resetMs = 2000) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copy = useCallback(
    async (text: string): Promise<boolean> => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => setCopied(false), resetMs);
        return true;
      } catch {
        return false;
      }
    },
    [resetMs]
  );

  // Clear a pending reset on unmount so it can't fire on a gone component.
  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  return { copied, copy };
}
