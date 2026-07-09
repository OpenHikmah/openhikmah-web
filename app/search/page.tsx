import type { Metadata } from "next";
import { Suspense } from "react";
import { RouteLoading } from "@/components/layout/RouteLoading";
import { SearchPageClient } from "./SearchPageClient";

export const metadata: Metadata = {
  title: "Search — Open Hikmah",
  description: "Search the Quran by keyword or by meaning, with full Arabic text and translation.",
};

export default function SearchPage() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <SearchPageClient />
    </Suspense>
  );
}
