"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

/** Shared body for route-segment `loading.tsx` boundaries. */
export function RouteLoading() {
  const t = useTranslations("errors");

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-[50vh] flex-1 items-center justify-center"
    >
      <Loader2 aria-hidden="true" className="h-6 w-6 animate-spin text-teal" />
      <span className="sr-only">{t("loading")}</span>
    </div>
  );
}
