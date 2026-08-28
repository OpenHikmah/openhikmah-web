"use client";

import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

/** Re-runs a page's `useAsync`/`usePaginated` loader. Sits in the
 *  `AdminPageHeader` actions slot. */
export function RefreshButton({ onClick, loading }: { onClick: () => void; loading?: boolean }) {
  return (
    <Button variant="secondary" size="sm" onClick={onClick} disabled={loading}>
      <RotateCw className={cn("mr-1.5 h-3.5 w-3.5", loading && "animate-spin")} />
      {loading ? "Refreshing…" : "Refresh"}
    </Button>
  );
}
