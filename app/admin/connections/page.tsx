"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { AdminPageHeader } from "@/components/admin/AdminShell";
import { Table, Th, Td, Pill, StateNote, ConfirmButton } from "@/components/admin/primitives";
import { useAdminFetch, AdminApiError } from "@/components/admin/AdminContext";
import { useAsync } from "@/components/admin/useAsync";
import { cn } from "@/lib/utils";

interface Connection {
  id: number;
  fromRef: string;
  toRef: string;
  kind: string;
  reason: string;
  model: string | null;
  confidence: number | null;
  status: "active" | "flagged" | "retired";
  reviewedAt: string | null;
}

const STATUS_FILTERS = ["all", "active", "flagged", "retired"] as const;
const KIND_FILTERS = ["all", "thematic", "root", "contrast"] as const;
const REVIEWED_FILTERS = ["pending", "reviewed", "all"] as const;

export default function ConnectionsPage() {
  const api = useAdminFetch();
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]>("all");
  const [kind, setKind] = useState<(typeof KIND_FILTERS)[number]>("all");
  const [reviewed, setReviewed] = useState<(typeof REVIEWED_FILTERS)[number]>("pending");
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const qs = new URLSearchParams();
  if (status !== "all") qs.set("status", status);
  if (kind !== "all") qs.set("kind", kind);
  if (reviewed !== "all") qs.set("reviewed", reviewed);

  const { data, error, loading, reload } = useAsync<{ connections: Connection[] }>(
    () => api(`/connections?${qs.toString()}`),
    `connections:${status}:${kind}:${reviewed}`
  );

  const setStatusOf = async (id: number, next: Connection["status"]) => {
    setActionError(null);
    setBusyId(id);
    try {
      await api("/connections", { method: "PATCH", json: { id, status: next } });
      reload();
    } catch (e) {
      setActionError(e instanceof AdminApiError ? e.message : "Failed to update connection.");
    } finally {
      setBusyId(null);
    }
  };

  const markReviewed = async (id: number) => {
    setActionError(null);
    setBusyId(id);
    try {
      await api("/connections", { method: "PATCH", json: { id, reviewed: true } });
      reload();
    } catch (e) {
      setActionError(e instanceof AdminApiError ? e.message : "Failed to update connection.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <AdminPageHeader
        title="Connections"
        subtitle="Moderate AI-generated edges. Flag suspect links or retire them from the graph."
      />
      <div className="space-y-4 p-7">
        <div className="flex flex-wrap items-center gap-4">
          <FilterRow
            label="Review"
            options={REVIEWED_FILTERS}
            value={reviewed}
            onChange={setReviewed}
          />
          <FilterRow label="Status" options={STATUS_FILTERS} value={status} onChange={setStatus} />
          <FilterRow label="Kind" options={KIND_FILTERS} value={kind} onChange={setKind} />
        </div>

        {error && <StateNote tone="error">{error}</StateNote>}
        {actionError && <StateNote tone="error">{actionError}</StateNote>}
        {loading && <StateNote>Loading…</StateNote>}
        {data && data.connections.length === 0 && <StateNote>No connections match.</StateNote>}

        {data && data.connections.length > 0 && (
          <Table>
            <thead>
              <tr>
                <Th>Edge</Th>
                <Th>Kind</Th>
                <Th>Why</Th>
                <Th>Status</Th>
                <Th>Review</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {data.connections.map((c) => (
                <tr key={c.id}>
                  <Td className="whitespace-nowrap font-mono text-xs text-text-secondary">
                    {c.fromRef} → {c.toRef}
                  </Td>
                  <Td>
                    <span className="text-xs text-text-secondary">{c.kind}</span>
                  </Td>
                  <Td className="max-w-md text-xs text-text-secondary">
                    <span className="line-clamp-2">{c.reason}</span>
                  </Td>
                  <Td>
                    <Pill tone={c.status}>{c.status}</Pill>
                  </Td>
                  <Td className="whitespace-nowrap text-xs text-text-secondary">
                    {c.reviewedAt ? (
                      new Date(c.reviewedAt).toLocaleString()
                    ) : (
                      <Pill tone="flagged">pending</Pill>
                    )}
                  </Td>
                  <Td>
                    <div className="flex justify-end gap-1.5">
                      {!c.reviewedAt && (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={busyId === c.id}
                          onClick={() => markReviewed(c.id)}
                        >
                          Mark reviewed
                        </Button>
                      )}
                      {c.status !== "flagged" && (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={busyId === c.id}
                          onClick={() => setStatusOf(c.id, "flagged")}
                        >
                          Flag
                        </Button>
                      )}
                      {c.status !== "retired" && (
                        <ConfirmButton
                          onConfirm={() => setStatusOf(c.id, "retired")}
                          confirmLabel="Retire?"
                          disabled={busyId === c.id}
                        >
                          Retire
                        </ConfirmButton>
                      )}
                      {c.status !== "active" && (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={busyId === c.id}
                          onClick={() => setStatusOf(c.id, "active")}
                        >
                          Restore
                        </Button>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
    </>
  );
}

function FilterRow<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
        {label}
      </span>
      <div className="flex gap-1">
        {options.map((o) => (
          <button
            key={o}
            onClick={() => onChange(o)}
            className={cn(
              "rounded border px-2 py-1 text-xs capitalize transition-colors",
              value === o
                ? "border-gold-muted bg-gold/10 text-gold"
                : "border-border text-text-secondary hover:border-gold-muted"
            )}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}
