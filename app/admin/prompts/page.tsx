"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { AdminPageHeader } from "@/components/admin/AdminShell";
import { Table, Th, Td, Pill, StateNote } from "@/components/admin/primitives";
import { useAdminFetch, AdminApiError } from "@/components/admin/AdminContext";
import { useAsync } from "@/components/admin/useAsync";
import { cn } from "@/lib/utils";

interface PromptVersionRow {
  id: number;
  key: string;
  template: string;
  createdBy: string | null;
  createdAt: string;
  active: boolean;
}

const PROMPT_KEYS = ["connection.legacy", "connection.selection"] as const;

export default function PromptsPage() {
  const api = useAdminFetch();
  const [key, setKey] = useState<(typeof PROMPT_KEYS)[number]>(PROMPT_KEYS[0]);
  const [draft, setDraft] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data, error, loading, reload } = useAsync<{ versions: PromptVersionRow[] }>(
    () => api(`/prompts?key=${encodeURIComponent(key)}`),
    `prompts:${key}`
  );

  const active = data?.versions.find((v) => v.active) ?? null;

  const createVersion = async () => {
    if (!draft.trim()) return;
    setActionError(null);
    setSaving(true);
    try {
      await api("/prompts", { method: "POST", json: { key, template: draft } });
      setDraft("");
      reload();
    } catch (e) {
      setActionError(e instanceof AdminApiError ? e.message : "Failed to save prompt version.");
    } finally {
      setSaving(false);
    }
  };

  const rollback = async (id: number) => {
    setActionError(null);
    try {
      await api("/prompts/rollback", { method: "POST", json: { id } });
      reload();
    } catch (e) {
      setActionError(e instanceof AdminApiError ? e.message : "Failed to roll back.");
    }
  };

  return (
    <>
      <AdminPageHeader
        title="Prompts"
        subtitle="Versioned templates for the AI connection generator. No active version means the hardcoded fallback is used."
      />
      <div className="space-y-4 p-7">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
            Slot
          </span>
          <div className="flex gap-1">
            {PROMPT_KEYS.map((k) => (
              <button
                key={k}
                onClick={() => setKey(k)}
                className={cn(
                  "rounded border px-2 py-1 text-xs transition-colors",
                  key === k
                    ? "border-gold-muted bg-gold/10 text-gold"
                    : "border-border text-text-secondary hover:border-gold-muted"
                )}
              >
                {k}
              </button>
            ))}
          </div>
        </div>

        {error && <StateNote tone="error">{error}</StateNote>}
        {actionError && <StateNote tone="error">{actionError}</StateNote>}

        <div className="space-y-2 rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-secondary">New version for {key}</span>
            {active === null && !loading && (
              <span className="text-xs text-text-muted">
                Currently using the hardcoded fallback template.
              </span>
            )}
          </div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={
              active
                ? active.template
                : "e.g. Reference: {{fromRef}}\nArabic: {{arabicText}}\n... Task: {{task}} ..."
            }
            rows={10}
            className="w-full rounded-md border border-border bg-bg px-3 py-2 font-mono text-xs text-text-primary focus:border-gold-muted"
          />
          <div className="flex justify-end">
            <Button size="sm" variant="primary" disabled={saving} onClick={createVersion}>
              {saving ? "Saving…" : "Create & activate"}
            </Button>
          </div>
        </div>

        {loading && <StateNote>Loading…</StateNote>}
        {data && data.versions.length === 0 && (
          <StateNote>No versions yet for this slot — using the hardcoded fallback.</StateNote>
        )}

        {data && data.versions.length > 0 && (
          <Table>
            <thead>
              <tr>
                <Th>Status</Th>
                <Th>Template</Th>
                <Th>Created by</Th>
                <Th>Created</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {data.versions.map((v) => (
                <tr key={v.id}>
                  <Td>
                    <Pill tone={v.active ? "active" : "neutral"}>
                      {v.active ? "active" : "inactive"}
                    </Pill>
                  </Td>
                  <Td className="max-w-md font-mono text-xs text-text-secondary">
                    <span className="line-clamp-2">{v.template}</span>
                  </Td>
                  <Td className="whitespace-nowrap text-xs text-text-secondary">
                    {v.createdBy ?? "—"}
                  </Td>
                  <Td className="whitespace-nowrap text-xs text-text-secondary">
                    {new Date(v.createdAt).toLocaleString()}
                  </Td>
                  <Td>
                    <div className="flex justify-end">
                      {!v.active && (
                        <Button size="sm" variant="secondary" onClick={() => rollback(v.id)}>
                          Roll back to this
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
