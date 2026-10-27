"use client";

import { useCallback, useState } from "react";
import { AdminApiError } from "./AdminContext";
import { useActionMessage } from "./useActionMessage";

/**
 * The shared shape of a per-row admin mutation: mark the row busy, run the
 * request, report success or the API's own error through `message` (render it
 * with `<Feedback>`), and clear busy. `run` resolves to whether it succeeded so
 * the caller can reload or close an editor only on success.
 */
export function useRowAction<K extends string | number = string>() {
  const { message, ok, fail, clear } = useActionMessage();
  const [busyId, setBusyId] = useState<K | null>(null);

  const run = useCallback(
    async (
      id: K,
      action: () => Promise<unknown>,
      text: { success: string; failure: string }
    ): Promise<boolean> => {
      clear();
      setBusyId(id);
      try {
        await action();
        ok(text.success);
        return true;
      } catch (e) {
        fail(e instanceof AdminApiError ? e.message : text.failure);
        return false;
      } finally {
        setBusyId(null);
      }
    },
    [clear, ok, fail]
  );

  return { run, busyId, message, fail, clear };
}
