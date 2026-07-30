import { Loader2 } from "lucide-react";
import { getTranslations } from "next-intl/server";

/** Shared body for route-segment `loading.tsx` boundaries. */
export async function RouteLoading() {
  const t = await getTranslations("errors");

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
