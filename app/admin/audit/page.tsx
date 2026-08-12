"use client";

import { useEffect, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminShell";
import { Table, Th, Td, StateNote } from "@/components/admin/primitives";
import { useAdminFetch } from "@/components/admin/AdminContext";
import { useAsync } from "@/components/admin/useAsync";
import { Button } from "@/components/ui";

interface Entry {
  id: number;
  adminQfId: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  meta: unknown;
  createdAt: string;
}

interface AuditPageData {
  entries: Entry[];
  hasMore: boolean;
}

export default function AuditPage() {
  const api = useAdminFetch();
  const { data, error, loading } = useAsync<AuditPageData>(() => api("/audit"), "audit");

  const [entries, setEntries] = useState<Entry[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);

  useEffect(() => {
    if (!data) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEntries(data.entries);
    setHasMore(data.hasMore);
  }, [data]);

  const loadMore = async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    setLoadMoreError(false);
    try {
      const page = await api<AuditPageData>(`/audit?offset=${entries.length}`);
      setEntries((prev) => [...prev, ...page.entries]);
      setHasMore(page.hasMore);
    } catch {
      setLoadMoreError(true);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <>
      <AdminPageHeader title="Audit Log" subtitle="Every mutating admin action, newest first." />
      <div className="space-y-4 p-7">
        {error && <StateNote tone="error">{error}</StateNote>}
        {loading && <StateNote>Loading…</StateNote>}
        {data && entries.length === 0 && <StateNote>No admin actions recorded yet.</StateNote>}

        {data && entries.length > 0 && (
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
              {entries.map((e) => (
                <tr key={e.id}>
                  <Td className="whitespace-nowrap text-xs text-text-muted">
                    {new Date(e.createdAt).toLocaleString()}
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

        {hasMore && (
          <div className="flex flex-col items-center gap-2">
            <Button variant="secondary" size="sm" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? "Loading…" : "Load more"}
            </Button>
            {loadMoreError && <StateNote tone="error">Couldn&apos;t load more entries.</StateNote>}
          </div>
        )}
      </div>
    </>
  );
}
