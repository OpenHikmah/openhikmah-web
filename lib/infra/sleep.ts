/**
 * A `setTimeout` that resolves after `ms`, or rejects immediately if the given
 * `AbortSignal` fires. Used wherever a delay must never outlive a cooperative
 * cancel (the admin "Stop job" button aborts the job's signal) — a bare
 * `setTimeout` would make a Stop click wait out the full backoff.
 */
export function interruptibleSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error("aborted"));
      return;
    }
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const onAbort = () => {
      cleanup();
      reject(signal?.reason ?? new Error("aborted"));
    };
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
