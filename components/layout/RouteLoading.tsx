import { Loader2 } from "lucide-react";

/** Shared body for route-segment `loading.tsx` boundaries. */
export function RouteLoading() {
  return (
    <div className="flex min-h-[50vh] flex-1 items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-teal" />
    </div>
  );
}
