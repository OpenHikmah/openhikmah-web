"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

/**
 * A single polite `role="status"` live region for the whole admin console, so
 * moderation actions (flag, retire, disable, finalize…) are announced to screen
 * readers — the visual `StateNote` feedback is otherwise silent to them.
 *
 * `announce("")` then the message, on a microtask gap, so re-announcing the
 * same string (e.g. flagging two rows in a row) still fires an SR update.
 */
const AnnounceContext = createContext<(message: string) => void>(() => {});

export function useAdminAnnounce(): (message: string) => void {
  return useContext(AnnounceContext);
}

export function AdminLiveRegion({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState("");
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const announce = useCallback((next: string) => {
    setMessage("");
    // Next microtask: let the empty render commit so a repeated message still
    // registers as a change.
    queueMicrotask(() => setMessage(next));
    if (clearTimer.current) clearTimeout(clearTimer.current);
    clearTimer.current = setTimeout(() => setMessage(""), 5000);
  }, []);

  return (
    <AnnounceContext.Provider value={announce}>
      {children}
      <div role="status" aria-live="polite" className="sr-only">
        {message}
      </div>
    </AnnounceContext.Provider>
  );
}
