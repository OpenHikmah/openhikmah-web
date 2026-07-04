"use client";

import { useState } from "react";
import { Button, Input } from "@/components/ui";
import { AdminPageHeader } from "@/components/admin/AdminShell";
import { Table, Th, Td, StateNote, ConfirmButton } from "@/components/admin/primitives";
import { useAdminFetch, AdminApiError } from "@/components/admin/AdminContext";
import { useAsync } from "@/components/admin/useAsync";

interface Flag {
  key: string;
  value: unknown;
  updatedBy: string | null;
  updatedAt: string;
}

export default function FlagsPage() {
  const api = useAdminFetch();
  const { data, error, loading, reload } = useAsync<{ flags: Flag[] }>(
    () => api("/flags"),
    "flags"
  );

  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const save = async () => {
    setMsg(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      setMsg('Value must be valid JSON (e.g. true, 42, "text", {"a":1}).');
      return;
    }
    try {
      await api("/flags", { method: "PUT", json: { key: key.trim(), value: parsed } });
      setKey("");
      setValue("");
      reload();
    } catch (e) {
      setMsg(e instanceof AdminApiError ? e.message : "Save failed.");
    }
  };

  const edit = (f: Flag) => {
    setKey(f.key);
    setValue(JSON.stringify(f.value));
    setMsg(null);
  };

  const remove = async (k: string) => {
    setMsg(null);
    try {
      await api(`/flags?key=${encodeURIComponent(k)}`, { method: "DELETE" });
      reload();
    } catch (e) {
      setMsg(e instanceof AdminApiError ? e.message : "Delete failed.");
    }
  };

  return (
    <>
      <AdminPageHeader
        title="Feature Flags"
        subtitle="Runtime config read by subsystems. A missing key falls back to its code default."
      />
      <div className="space-y-6 p-7">
        <div className="space-y-3 rounded-lg border border-border bg-surface p-5">
          <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
            <label className="space-y-1.5">
              <span className="text-xs text-text-secondary">Key</span>
              <Input
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="rate_limit.window_s"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs text-text-secondary">Value (JSON)</span>
              <Input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder='e.g. 60 or {"model":"x"}'
              />
            </label>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="primary" onClick={save} disabled={!key.trim() || !value.trim()}>
              Save flag
            </Button>
            {msg && <span className="text-xs text-error">{msg}</span>}
          </div>
        </div>

        {error && <StateNote tone="error">{error}</StateNote>}
        {loading && <StateNote>Loading…</StateNote>}
        {data && data.flags.length === 0 && <StateNote>No flags set.</StateNote>}

        {data && data.flags.length > 0 && (
          <Table>
            <thead>
              <tr>
                <Th>Key</Th>
                <Th>Value</Th>
                <Th>Updated</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {data.flags.map((f) => (
                <tr key={f.key}>
                  <Td className="font-mono text-xs text-gold">{f.key}</Td>
                  <Td className="max-w-xs font-mono text-xs text-text-secondary">
                    <span className="line-clamp-2 break-all">{JSON.stringify(f.value)}</span>
                  </Td>
                  <Td className="whitespace-nowrap text-xs text-text-muted">
                    {new Date(f.updatedAt).toLocaleDateString()}
                  </Td>
                  <Td>
                    <div className="flex justify-end gap-1.5">
                      <Button size="sm" variant="secondary" onClick={() => edit(f)}>
                        Edit
                      </Button>
                      <ConfirmButton onConfirm={() => remove(f.key)} confirmLabel="Delete?">
                        Delete
                      </ConfirmButton>
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
