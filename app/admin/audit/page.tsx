"use client";

import { AdminPageHeader } from "@/components/admin/AdminShell";
import { Table, Th, Td, StateNote, LoadMore } from "@/components/admin/primitives";
import { SkeletonRows } from "@/components/admin/Skeleton";
import { useAdminFetch } from "@/components/admin/AdminContext";
import { usePaginated } from "@/components/admin/usePaginated";
import { formatTimestamp } from "@/lib/admin/format";

interface Entry {
  id: number;
  adminQfId: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  meta: unknown;
  createdAt: string;
}

export default function AuditPage() {
  const api = useAdminFetch();
  const { rows, hasMore, error, loading, loadingMore, loadMoreError, loadMore } =
    usePaginated<Entry>(async ({ offset }) => {
      const d = await api<{ entries: Entry[]; hasMore: boolean }>(
        `/audit${offset ? `?offset=${offset}` : ""}`
      );
      return { rows: d.entries, hasMore: d.hasMore };
    }, "audit");

  return (
    <>
      <AdminPageHeader title="Audit Log" subtitle="Every mutating admin action, newest first." />
      <div className="space-y-6 p-7">
        {error && <StateNote tone="error">{error}</StateNote>}
        {loading && <SkeletonRows />}
        {!loading && !error && rows.length === 0 && (
          <StateNote>No admin actions recorded yet.</StateNote>
        )}

        {rows.length > 0 && (
          <Table>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Action</Th>
                <Th>Target</Th>
                <Th>Detail</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id}>
                  <Td className="whitespace-nowrap text-xs text-text-muted">
                    {formatTimestamp(e.createdAt)}
                  </Td>
                  <Td className="whitespace-nowrap font-mono text-xs text-gold">{e.action}</Td>
                  <Td className="whitespace-nowrap text-xs text-text-secondary">
                    {e.targetType ? `${e.targetType}:${e.targetId ?? ""}` : "—"}
                  </Td>
                  <Td className="max-w-md font-mono text-[11px] text-text-muted">
                    <span className="line-clamp-2 break-all">
                      {e.meta ? JSON.stringify(e.meta) : ""}
                    </span>
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
