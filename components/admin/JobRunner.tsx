"use client";

import { useEffect, useState } from "react";
import { Table, Th, Td, Pill, StateNote, ConfirmButton } from "@/components/admin/primitives";
import { useAdminFetch, AdminApiError } from "@/components/admin/AdminContext";
import { useAsync } from "@/components/admin/useAsync";

interface JobStatus {
  id: string;
  label: string;
  status: "never-run" | "running" | "success" | "failed" | "cancelled";
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  logTail: string | null;
}

interface JobsResponse {
  jobs: JobStatus[];
  embedCoverage: { embedded: number; total: number };
}

const statusTone = (s: JobStatus["status"]) =>
  s === "running" ? "flagged" : s === "success" ? "active" : s === "failed" ? "retired" : "neutral";

const STOPPABLE = new Set(["backfill-connections"]);

export function JobRunner() {
  const api = useAdminFetch();
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data, error, loading, reload } = useAsync<JobsResponse>(() => api("/jobs"), "admin-jobs");

  // Poll while any job is running, so status/log-tail reflects progress
  // without a manual reload — but only while there's something to watch.
  // keepDataOnError only on the poll's own reloads: a transient blip here
  // shouldn't wipe the table, but the reload right after starting a job
  // (below) should still clear stale data on failure, so a failure there
  // can't silently strand `anyRunning` on data from before the job started.
  const anyRunning = data?.jobs.some((j) => j.status === "running") ?? false;
  useEffect(() => {
    if (!anyRunning) return;
    const id = setInterval(() => reload({ keepDataOnError: true }), 4000);
    return () => clearInterval(id);
  }, [anyRunning, reload]);

  const run = async (jobId: JobStatus["id"]) => {
    setActionError(null);
    setBusyId(jobId);
    try {
      await api("/jobs", { method: "POST", json: { jobId } });
      reload();
    } catch (e) {
      setActionError(e instanceof AdminApiError ? e.message : "Failed to start job.");
    } finally {
      setBusyId(null);
    }
  };

  const stop = async (jobId: JobStatus["id"]) => {
    setActionError(null);
    setBusyId(jobId);
    try {
      await api("/jobs", { method: "POST", json: { jobId, action: "stop" } });
      reload();
    } catch (e) {
      setActionError(e instanceof AdminApiError ? e.message : "Failed to stop job.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      {error && <StateNote tone="error">{error}</StateNote>}
      {actionError && <StateNote tone="error">{actionError}</StateNote>}
      {loading && <StateNote>Loading…</StateNote>}

      {data && (
        <Table>
          <thead>
            <tr>
              <Th>Job</Th>
              <Th>Status</Th>
              <Th>Last run</Th>
              <Th>Detail</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {data.jobs.map((job) => (
              <tr key={job.id}>
                <Td className="text-sm text-text-primary">{job.label}</Td>
                <Td>
                  <Pill tone={statusTone(job.status)}>{job.status.replace("-", " ")}</Pill>
                </Td>
                <Td className="whitespace-nowrap text-xs text-text-muted">
                  {job.startedAt ? new Date(job.startedAt).toLocaleString() : "—"}
                </Td>
                <Td className="max-w-sm">
                  {job.id === "embed-corpus" && (
                    <div className="text-xs text-text-secondary">
                      {data.embedCoverage.embedded}/{data.embedCoverage.total} verses embedded
                    </div>
                  )}
                  {job.error && <div className="text-xs text-error">{job.error}</div>}
                  {job.logTail && (
                    <pre className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap break-all font-mono text-[10px] text-text-muted">
                      {job.logTail}
                    </pre>
                  )}
                </Td>
                <Td>
                  <div className="flex justify-end gap-2">
                    {job.status === "running" && STOPPABLE.has(job.id) && (
                      <ConfirmButton
                        variant="danger"
                        disabled={busyId === job.id}
                        onConfirm={() => stop(job.id)}
                        confirmLabel="Stop the running job?"
                      >
                        Stop
                      </ConfirmButton>
                    )}
                    {job.id === "backfill-connections" ? (
                      job.status !== "running" && (
                        <a
                          href="/admin/coverage"
                          className="text-xs text-text-muted underline hover:text-text-secondary"
                        >
                          Run from Coverage →
                        </a>
                      )
                    ) : (
                      <ConfirmButton
                        variant="secondary"
                        disabled={busyId === job.id || job.status === "running"}
                        onConfirm={() => run(job.id)}
                        confirmLabel="Run now?"
                      >
                        Run
                      </ConfirmButton>
                    )}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
