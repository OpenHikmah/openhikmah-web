"use client";

import { AdminPageHeader } from "@/components/admin/AdminShell";
import { CoverageReport } from "@/components/admin/CoverageReport";

export default function CoveragePage() {
  return (
    <>
      <AdminPageHeader
        title="Coverage"
        subtitle="Which verses have no connection yet, per language — and run the backfill job to fill them."
      />
      <div className="p-7">
        <CoverageReport />
      </div>
    </>
  );
}
