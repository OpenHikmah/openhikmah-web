"use client";

import { useEffect } from "react";
import Link from "next/link";
import { TriangleAlert, RotateCw, Home } from "lucide-react";

// Branded route-level error boundary. Catches render/runtime errors in the page
// subtree and shows a recoverable fallback instead of Next's raw default page
// (which can leak a stack trace). Next 16 passes `unstable_retry`, not `reset`.
export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-bg px-6 text-center">
      <TriangleAlert className="mb-5 h-10 w-10 text-gold" />
      <h1 className="text-2xl font-semibold text-text-primary">Something went wrong</h1>
      <p className="mt-2 max-w-sm text-sm text-text-secondary">
        An unexpected error interrupted this page. You can try again, or head back home.
      </p>
      {error.digest && (
        <p className="mt-3 font-mono text-xs text-text-muted">ref: {error.digest}</p>
      )}
      <div className="mt-6 flex items-center gap-2">
        <button
          onClick={() => unstable_retry()}
          className="inline-flex items-center gap-1.5 rounded-md bg-gold px-4 py-2 text-sm font-medium text-ink transition-opacity hover:opacity-90"
        >
          <RotateCw className="h-3.5 w-3.5" />
          Try again
        </button>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm text-text-secondary transition-colors hover:border-gold-muted hover:text-gold"
        >
          <Home className="h-3.5 w-3.5" />
          Home
        </Link>
      </div>
    </div>
  );
}
