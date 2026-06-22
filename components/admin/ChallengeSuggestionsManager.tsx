"use client";

import { useState } from "react";
import { Button, Input } from "@/components/ui";
import { Table, Th, Td, Pill, StateNote, ConfirmButton } from "@/components/admin/primitives";
import { useAdminFetch, AdminApiError } from "@/components/admin/AdminContext";
import { useAsync } from "@/components/admin/useAsync";

interface Suggestion {
  id: number;
  title: string;
  description: string | null;
  verseRef: string | null;
  suggestedDuration: string | null;
  isActive: boolean;
  sortOrder: number;
}

const DURATIONS = ["", "24h", "48h", "7d"] as const;

const EMPTY = {
  id: null as number | null,
  title: "",
  description: "",
  verseRef: "",
  suggestedDuration: "",
  sortOrder: 0,
  isActive: true,
};

export function ChallengeSuggestionsManager() {
  const api = useAdminFetch();
  const { data, error, loading, reload } = useAsync<{ suggestions: Suggestion[] }>(
    () => api("/challenge-suggestions"),
    "challenge-suggestions"
  );
  const [form, setForm] = useState({ ...EMPTY });
  const [msg, setMsg] = useState<string | null>(null);

  const editing = form.id !== null;
  const reset = () => setForm({ ...EMPTY });

  const save = async () => {
    setMsg(null);
    const payload = {
      ...(editing ? { id: form.id } : {}),
      title: form.title.trim(),
      description: form.description.trim() || null,
      verseRef: form.verseRef.trim() || null,
      suggestedDuration: form.suggestedDuration || null,
      sortOrder: Number(form.sortOrder) || 0,
      isActive: form.isActive,
    };
    try {
      await api("/challenge-suggestions", { method: editing ? "PUT" : "POST", json: payload });
      reset();
      reload();
    } catch (e) {
      setMsg(e instanceof AdminApiError ? e.message : "Save failed.");
    }
  };

  const edit = (s: Suggestion) =>
    setForm({
      id: s.id,
      title: s.title,
      description: s.description ?? "",
      verseRef: s.verseRef ?? "",
      suggestedDuration: s.suggestedDuration ?? "",
      sortOrder: s.sortOrder,
      isActive: s.isActive,
    });

  const remove = async (id: number) => {
    setMsg(null);
    try {
      await api(`/challenge-suggestions?id=${id}`, { method: "DELETE" });
      if (form.id === id) reset();
      reload();
    } catch (e) {
      setMsg(e instanceof AdminApiError ? e.message : "Delete failed.");
    }
  };

  const toggleActive = async (s: Suggestion) => {
    setMsg(null);
    try {
      await api("/challenge-suggestions", {
        method: "PUT",
        json: {
          id: s.id,
          title: s.title,
          description: s.description,
          verseRef: s.verseRef,
          suggestedDuration: s.suggestedDuration,
          sortOrder: s.sortOrder,
          isActive: !s.isActive,
        },
      });
      reload();
    } catch (e) {
      setMsg(e instanceof AdminApiError ? e.message : "Update failed.");
    }
  };

  return (
    <div className="space-y-4">
      {/* Editor */}
      <div className="space-y-3 rounded-lg border border-border bg-surface p-5">
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted">
          {editing ? `Editing suggestion #${form.id}` : "New suggestion"}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs text-text-secondary">Title</span>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. A week of patience" />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs text-text-secondary">Verse (optional)</span>
            <Input value={form.verseRef} onChange={(e) => setForm({ ...form, verseRef: e.target.value })} placeholder="e.g. 2:155" />
          </label>
        </div>
        <label className="block space-y-1.5">
          <span className="text-xs text-text-secondary">Description (optional)</span>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={2}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-gold-muted"
            placeholder="A short prompt shown to users…"
          />
        </label>
        <div className="flex flex-wrap items-end gap-4">
          <label className="space-y-1.5">
            <span className="block text-xs text-text-secondary">Suggested duration</span>
            <select
              value={form.suggestedDuration}
              onChange={(e) => setForm({ ...form, suggestedDuration: e.target.value })}
              className="h-10 rounded-md border border-border bg-surface px-2 text-sm text-text-primary focus:border-gold-muted"
            >
              {DURATIONS.map((d) => (
                <option key={d} value={d} className="bg-surface">
                  {d || "user picks"}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="block text-xs text-text-secondary">Sort order</span>
            <Input
              type="number"
              value={String(form.sortOrder)}
              onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
              className="w-24"
            />
          </label>
          <label className="flex items-center gap-2 pb-2.5 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            />
            Active
          </label>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="primary" onClick={save} disabled={!form.title.trim()}>
            {editing ? "Update" : "Create"}
          </Button>
          {editing && (
            <Button variant="ghost" onClick={reset}>
              Cancel
            </Button>
          )}
          {msg && <span className="text-xs text-error">{msg}</span>}
        </div>
      </div>

      {error && <StateNote tone="error">{error}</StateNote>}
      {loading && <StateNote>Loading…</StateNote>}
      {data && data.suggestions.length === 0 && <StateNote>No suggestions yet.</StateNote>}

      {data && data.suggestions.length > 0 && (
        <Table>
          <thead>
            <tr>
              <Th>Title</Th>
              <Th>Verse</Th>
              <Th>Duration</Th>
              <Th>Active</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {data.suggestions.map((s) => (
              <tr key={s.id}>
                <Td className="text-sm text-text-primary">{s.title}</Td>
                <Td className="font-mono text-xs text-text-muted">{s.verseRef ?? "—"}</Td>
                <Td className="text-xs text-text-secondary">{s.suggestedDuration ?? "any"}</Td>
                <Td>
                  <button onClick={() => toggleActive(s)} title="Toggle active">
                    <Pill tone={s.isActive ? "active" : "retired"}>{s.isActive ? "on" : "off"}</Pill>
                  </button>
                </Td>
                <Td>
                  <div className="flex justify-end gap-1.5">
                    <Button size="sm" variant="secondary" onClick={() => edit(s)}>
                      Edit
                    </Button>
                    <ConfirmButton onConfirm={() => remove(s.id)} confirmLabel="Delete?">
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
  );
}
