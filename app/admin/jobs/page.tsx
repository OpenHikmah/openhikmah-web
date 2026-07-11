"use client";

import { AdminPageHeader } from "@/components/admin/AdminShell";
import { JobRunner } from "@/components/admin/JobRunner";

export default function JobsPage() {
  return (
    <>
      <AdminPageHeader
        title="Jobs"
        subtitle="Trigger and monitor the corpus seed, morphology seed, and embedding backfills."
      />
      <div className="p-7">
        <JobRunner />
      </div>
    </>
  );
}
