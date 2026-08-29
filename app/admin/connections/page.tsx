"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { AdminPageHeader } from "@/components/admin/AdminShell";
import {
  Table,
  Th,
  Td,
  Pill,
  StateNote,
  ConfirmButton,
  LoadMore,
} from "@/components/admin/primitives";
import { AdminToggle } from "@/components/admin/AdminToggle";
import { useAdminFetch, AdminApiError } from "@/components/admin/AdminContext";
import { usePaginated } from "@/components/admin/usePaginated";
import { ExpandableText } from "@/components/admin/ExpandableText";
import { SkeletonRows } from "@/components/admin/Skeleton";
import { useAdminAnnounce } from "@/components/admin/AdminLiveRegion";
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

/** `["all", "active"]` → `[{ value: "all", label: "All" }, …]` for `AdminToggle`. */
function toOptions<T extends string>(values: readonly T[]): { value: T; label: string }[] {
  return values.map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }));
}

export default function ConnectionsPage() {
  const api = useAdminFetch();
  const announce = useAdminAnnounce();
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]>("all");
  const [kind, setKind] = useState<(typeof KIND_FILTERS)[number]>("all");
  const [reviewed, setReviewed] = useState<(typeof REVIEWED_FILTERS)[number]>("pending");
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const baseParams = () => {
    const p = new URLSearchParams();
    if (status !== "all") p.set("status", status);
    if (kind !== "all") p.set("kind", kind);
    if (reviewed !== "all") p.set("reviewed", reviewed);
    return p;
  };

  const { rows, hasMore, error, loading, loadingMore, loadMoreError, reload, loadMore } =
    usePaginated<Connection>(async ({ offset }) => {
      const p = baseParams();
      if (offset) p.set("offset", String(offset));
      const d = await api<{ connections: Connection[]; hasMore: boolean }>(
        `/connections?${p.toString()}`
      );
      return { rows: d.connections, hasMore: d.hasMore };
    }, `connections:${status}:${kind}:${reviewed}`);

  const setStatusOf = async (id: number, next: Connection["status"]) => {
    setActionError(null);
    setBusyId(id);
    try {
      await api("/connections", { method: "PATCH", json: { id, status: next } });
      announce(`Connection ${id} set to ${next}.`);
      reload();
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Failed to update connection.";
      setActionError(msg);
      announce(msg);
    } finally {
      setBusyId(null);
    }
  };

  const markReviewed = async (id: number) => {
    setActionError(null);
    setBusyId(id);
    try {
      await api("/connections", { method: "PATCH", json: { id, reviewed: true } });
      announce(`Connection ${id} marked reviewed.`);
      reload();
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Failed to update connection.";
      setActionError(msg);
      announce(msg);
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
          <AdminToggle
            label="Review"
            options={toOptions(REVIEWED_FILTERS)}
            value={reviewed}
            onChange={setReviewed}
          />
          <AdminToggle
            label="Status"
            options={toOptions(STATUS_FILTERS)}
            value={status}
            onChange={setStatus}
          />
          <AdminToggle
            label="Kind"
            options={toOptions(KIND_FILTERS)}
            value={kind}
            onChange={setKind}
          />
        </div>

        {error && <StateNote tone="error">{error}</StateNote>}
        {actionError && <StateNote tone="error">{actionError}</StateNote>}
        {loading && <SkeletonRows />}
        {!loading && !error && rows.length === 0 && <StateNote>No connections match.</StateNote>}

        {rows.length > 0 && (
          <Table>
            <thead>
              <tr>
                <Th>Edge</Th>
                <Th>Kind</Th>
                <Th>Why</Th>
                <Th>Confidence</Th>
                <Th>Status</Th>
                <Th>Review</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <Td className="whitespace-nowrap font-mono text-xs text-text-secondary">
                    {c.fromRef} → {c.toRef}
                  </Td>
                  <Td>
                    <span className="text-xs text-text-secondary">{c.kind}</span>
                  </Td>
                  <Td className="max-w-md text-xs text-text-secondary">
                    <ExpandableText>{c.reason}</ExpandableText>
                  </Td>
                  <Td className="whitespace-nowrap text-xs">
                    {c.confidence === null ? (
                      <span className="text-text-muted">—</span>
                    ) : (
                      <span className={cn(c.confidence < 50 ? "text-gold" : "text-text-secondary")}>
                        {c.confidence}%
                      </span>
                    )}
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

        <LoadMore
          hasMore={hasMore}
          loading={loadingMore}
          error={loadMoreError}
          onClick={loadMore}
        />
      </div>
    </>
  );
}
