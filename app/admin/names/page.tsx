"use client";

import { Fragment, useState } from "react";
import { Button } from "@/components/ui";
import { AdminPageHeader } from "@/components/admin/AdminShell";
import { Table, Th, Td, Pill, StateNote, ConfirmButton } from "@/components/admin/primitives";
import { useAdminFetch, AdminApiError } from "@/components/admin/AdminContext";
import { useAsync } from "@/components/admin/useAsync";

interface Row {
  slug: string;
  kind: string;
  data: unknown;
  model: string | null;
  version: number;
  updatedAt: string;
}

export default function NamesPage() {
  const api = useAdminFetch();
  const { data, error, loading, reload } = useAsync<{ rows: Row[] }>(() => api("/names"), "names");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const startEdit = (r: Row) => {
    setEditing(`${r.slug}/${r.kind}`);
    setDraft(JSON.stringify(r.data, null, 2));
    setMsg(null);
  };

  const save = async (r: Row) => {
    setMsg(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(draft);
    } catch {
      setMsg("Data must be valid JSON.");
      return;
    }
    try {
      await api("/names", { method: "PATCH", json: { slug: r.slug, kind: r.kind, data: parsed } });
      setEditing(null);
      reload();
    } catch (e) {
      setMsg(e instanceof AdminApiError ? e.message : "Save failed.");
    }
  };

  const invalidate = async (r: Row) => {
    setMsg(null);
    try {
      await api(`/names?slug=${encodeURIComponent(r.slug)}&kind=${r.kind}`, { method: "DELETE" });
      reload();
    } catch (e) {
      setMsg(e instanceof AdminApiError ? e.message : "Invalidate failed.");
    }
  };

  return (
    <>
      <AdminPageHeader
        title="Names Content"
        subtitle="Cached AI content per Divine Name. Edit the payload or invalidate to regenerate."
      />
      <div className="space-y-4 p-7">
        {error && <StateNote tone="error">{error}</StateNote>}
        {msg && <StateNote tone="error">{msg}</StateNote>}
        {loading && <StateNote>Loading…</StateNote>}
        {data && data.rows.length === 0 && <StateNote>No cached name content yet.</StateNote>}

        {data && data.rows.length > 0 && (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Kind</Th>
                <Th>Model</Th>
                <Th>Ver</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => {
                const id = `${r.slug}/${r.kind}`;
                const isEditing = editing === id;
                return (
                  <Fragment key={id}>
                    <tr>
                      <Td className="text-sm text-text-primary">{r.slug}</Td>
                      <Td>
                        <Pill>{r.kind}</Pill>
                      </Td>
                      <Td className="font-mono text-[11px] text-text-muted">{r.model ?? "—"}</Td>
                      <Td className="tabular-nums text-text-secondary">{r.version}</Td>
                      <Td>
                        <div className="flex justify-end gap-1.5">
                          <Button size="sm" variant="secondary" onClick={() => startEdit(r)}>
                            {isEditing ? "Editing…" : "Edit"}
                          </Button>
                          <ConfirmButton onConfirm={() => invalidate(r)} confirmLabel="Invalidate?">
                            Invalidate
                          </ConfirmButton>
                        </div>
                      </Td>
                    </tr>
                    {isEditing && (
                      <tr>
                        <td colSpan={5} className="border-b border-border-subtle bg-bg px-3.5 py-3">
                          <textarea
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            rows={10}
                            className="w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-xs text-text-primary focus:border-gold-muted"
                          />
                          <div className="mt-2 flex items-center gap-2">
                            <Button size="sm" variant="primary" onClick={() => save(r)}>
                              Save
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                              Cancel
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </Table>
        )}
      </div>
    </>
  );
}
