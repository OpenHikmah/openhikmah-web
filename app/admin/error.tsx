"use client";

import { RouteError } from "@/components/layout/RouteError";

// Scoped to the admin segment: AdminShell chrome (from layout.tsx) stays
// mounted, only this page's content area is replaced. Next 16 passes
// `unstable_retry`, not `reset`.
export default function AdminError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return <RouteError error={error} retry={unstable_retry} homeHref="/admin" homeLabel="Admin home" />;
}
