import { useEffect, useRef, useState } from "react";

const ARM_WINDOW_MS = 3000;

/**
 * Two-click confirm for a destructive action: the first call arms it and
 * auto-disarms after a few seconds; a second call within that window runs
 * `onConfirm`. Cheaper than a modal for inline destructive controls (icon
 * buttons, table row actions) where a dialog would be disruptive.
 */
export function useArmedConfirm(onConfirm: () => void) {
  const [armed, setArmed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  const trigger = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (armed) {
      setArmed(false);
      onConfirm();
    } else {
      setArmed(true);
      timerRef.current = setTimeout(() => setArmed(false), ARM_WINDOW_MS);
    }
  };

  return { armed, trigger };
}
