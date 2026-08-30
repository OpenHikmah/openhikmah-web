"use client";

import { useState } from "react";
import { Button, Input, Textarea, NativeSelect } from "@/components/ui";
import {
  Table,
  Th,
  Td,
  Pill,
  StateNote,
  ConfirmButton,
  Panel,
} from "@/components/admin/primitives";
import { Field } from "@/components/admin/Field";
import { Feedback } from "@/components/admin/Feedback";
import { SkeletonRows } from "@/components/admin/Skeleton";
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
  const [saving, setSaving] = useState(false);
  // Id of the suggestion currently being toggled/removed — blocks overlapping
  // row actions so a double-click can't fire duplicate PUT/DELETE requests.
  const [busyId, setBusyId] = useState<number | null>(null);

  const editing = form.id !== null;
  const reset = () => setForm({ ...EMPTY });
  // One request in flight at a time — save and row actions (toggle/remove)
  // must not overlap, so guard and disable both against this single condition.
  const busy = saving || busyId !== null;

  const save = async () => {
    if (busy) return;
    setSaving(true);
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
    } finally {
      setSaving(false);
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
    if (busy) return;
    setBusyId(id);
    setMsg(null);
    try {
      await api(`/challenge-suggestions?id=${id}`, { method: "DELETE" });
      if (form.id === id) reset();
      reload();
    } catch (e) {
      setMsg(e instanceof AdminApiError ? e.message : "Delete failed.");
    } finally {
      setBusyId(null);
    }
  };

  const toggleActive = async (s: Suggestion) => {
    if (busy) return;
    setBusyId(s.id);
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
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Editor */}
      <Panel className="space-y-3">
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted">
          {editing ? `Editing suggestion #${form.id}` : "New suggestion"}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Title">
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. A week of patience"
            />
          </Field>
          <Field label="Verse (optional)">
            <Input
              value={form.verseRef}
              onChange={(e) => setForm({ ...form, verseRef: e.target.value })}
              placeholder="e.g. 2:155"
            />
          </Field>
        </div>
        <Field label="Description (optional)">
          <Textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={2}
            placeholder="A short prompt shown to users…"
          />
        </Field>
        <div className="flex flex-wrap items-end gap-4">
          <Field label="Suggested duration">
            <NativeSelect
              value={form.suggestedDuration}
              onChange={(e) => setForm({ ...form, suggestedDuration: e.target.value })}
              className="w-40"
            >
              {DURATIONS.map((d) => (
                <option key={d} value={d}>
                  {d || "user picks"}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Sort order">
            <Input
              type="number"
              value={String(form.sortOrder)}
              onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
              className="w-24"
            />
          </Field>
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
          <Button variant="primary" onClick={save} disabled={busy || !form.title.trim()}>
            {editing ? "Update" : "Create"}
          </Button>
          {editing && (
            <Button variant="ghost" onClick={reset} disabled={busy}>
              Cancel
            </Button>
          )}
          {msg && <Feedback tone="error">{msg}</Feedback>}
        </div>
      </Panel>

      {error && <StateNote tone="error">{error}</StateNote>}
      {loading && !data && <SkeletonRows />}
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
                  <button
                    onClick={() => toggleActive(s)}
                    disabled={busy}
                    aria-label={`${s.isActive ? "Deactivate" : "Activate"} suggestion "${s.title}"`}
                    className="disabled:opacity-50"
                  >
                    <Pill tone={s.isActive ? "active" : "retired"}>
                      {s.isActive ? "on" : "off"}
                    </Pill>
                  </button>
                </Td>
                <Td>
                  <div className="flex justify-end gap-1.5">
                    <Button size="sm" variant="secondary" onClick={() => edit(s)} disabled={busy}>
                      Edit
                    </Button>
                    <ConfirmButton
                      onConfirm={() => remove(s.id)}
                      disabled={busy}
                      confirmLabel="Delete?"
                    >
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
