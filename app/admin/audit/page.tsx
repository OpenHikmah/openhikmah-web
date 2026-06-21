"use client";

import { AdminPageHeader } from "@/components/admin/AdminShell";
import { Table, Th, Td, StateNote } from "@/components/admin/primitives";
import { useAdminFetch } from "@/components/admin/AdminContext";
import { useAsync } from "@/components/admin/useAsync";

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
  const { data, error, loading } = useAsync<{ entries: Entry[] }>(() => api("/audit"), "audit");

  return (
    <>
      <AdminPageHeader title="Audit Log" subtitle="Every mutating admin action, newest first." />
      <div className="space-y-4 p-7">
        {error && <StateNote tone="error">{error}</StateNote>}
        {loading && <StateNote>Loading…</StateNote>}
        {data && data.entries.length === 0 && <StateNote>No admin actions recorded yet.</StateNote>}

        {data && data.entries.length > 0 && (
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
              {data.entries.map((e) => (
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
      </div>
    </>
  );
}
