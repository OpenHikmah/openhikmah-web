import type { Metadata } from "next";
import { AdminGate } from "@/components/admin/AdminGate";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminLiveRegion } from "@/components/admin/AdminLiveRegion";

export const metadata: Metadata = {
  title: "Admin — Open Hikmah",
  // The admin surface must never be indexed; access is gated client- and API-side.
  robots: { index: false, follow: false },
};

// The console is fully client-driven (the access token lives in memory), so never
// statically optimise these routes.
export const dynamic = "force-dynamic";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminGate>
      <AdminLiveRegion>
        <AdminShell>{children}</AdminShell>
      </AdminLiveRegion>
    </AdminGate>
  );
}
