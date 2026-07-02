"use client";

import { useEffect } from "react";
import Link from "next/link";
import { TriangleAlert, RotateCw, Home } from "lucide-react";

/**
 * Shared body for route-segment `error.tsx` boundaries. A segment's own
 * layout stays mounted around this (Next only replaces the segment's content),
 * so each caller passes the right "go back" destination for its section.
 */
export function RouteError({
  error,
  retry,
  homeHref = "/",
  homeLabel = "Home",
}: {
  error: Error & { digest?: string };
  retry: () => void;
  homeHref?: string;
  homeLabel?: string;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-1 flex-col items-center justify-center px-6 text-center">
      <TriangleAlert className="mb-4 h-8 w-8 text-gold" />
      <h2 className="text-lg font-semibold text-text-primary">This page failed to load</h2>
      <p className="mt-1.5 max-w-sm text-sm text-text-secondary">
        An unexpected error interrupted this section. You can try again, or go back.
      </p>
      {error.digest && (
        <p className="mt-2.5 font-mono text-xs text-text-muted">ref: {error.digest}</p>
      )}
      <div className="mt-5 flex items-center gap-2">
        <button
          onClick={() => retry()}
          className="inline-flex items-center gap-1.5 rounded-md bg-gold px-4 py-2 text-sm font-medium text-ink transition-opacity hover:opacity-90"
        >
          <RotateCw className="h-3.5 w-3.5" />
          Try again
        </button>
        <Link
          href={homeHref}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm text-text-secondary transition-colors hover:border-gold-muted hover:text-gold"
        >
          <Home className="h-3.5 w-3.5" />
          {homeLabel}
        </Link>
      </div>
    </div>
  );
}
