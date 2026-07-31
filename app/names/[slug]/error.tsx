"use client";

import { useTranslations } from "next-intl";
import { RouteError } from "@/components/layout/RouteError";

// Next 16 passes `unstable_retry`, not `reset`.
export default function NameError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const t = useTranslations("names");
  return (
    <RouteError error={error} retry={unstable_retry} homeHref="/names" homeLabel={t("allNames")} />
  );
}
