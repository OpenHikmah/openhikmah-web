"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button, Input, ReflectionNote } from "@/components/ui";
import { AdminPageHeader } from "@/components/admin/AdminShell";
import { StateNote, ConfirmButton } from "@/components/admin/primitives";
import { useAdminFetch, AdminApiError } from "@/components/admin/AdminContext";
import { useAsync } from "@/components/admin/useAsync";
import { cn } from "@/lib/utils";
import type { Verse } from "@/types/quran";

interface Entry {
  date: string;
  verseRef: string;
  reflection: string | null;
  updatedAt: string;
}

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

function addMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function VotdPage() {
  const api = useAdminFetch();
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [selected, setSelected] = useState<string | null>(null);

  // Changing month clears the selection so the editor can't act on a day from a
  // different month than the one being viewed.
  const goToMonth = (next: string) => {
    setMonth(next);
    setSelected(null);
  };

  const { data, error, loading, reload } = useAsync<{ entries: Entry[] }>(
    () => api(`/votd?month=${month}`),
    `votd:${month}`
  );

  const byDate = new Map((data?.entries ?? []).map((e) => [e.date, e]));
  const [y, m] = month.split("-").map(Number);
  const firstWeekday = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();

  return (
    <>
      <AdminPageHeader
        title="Verse of the Day"
        subtitle="Curate the daily verse. A set day overrides the algorithmic pick."
      />
      <div className="grid gap-6 p-7 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium text-text-primary">{monthLabel(month)}</h2>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => goToMonth(addMonth(month, -1))}
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => goToMonth(addMonth(month, 1))}
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {error && <StateNote tone="error">{error}</StateNote>}

          <div className="grid grid-cols-7 gap-1.5">
            {WEEKDAYS.map((d, i) => (
              <div
                key={i}
                className="pb-1 text-center font-mono text-[10px] uppercase text-text-muted"
              >
                {d}
              </div>
            ))}
            {Array.from({ length: firstWeekday }).map((_, i) => (
              <div key={`pad-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const date = `${month}-${String(day).padStart(2, "0")}`;
              const entry = byDate.get(date);
              const isSelected = selected === date;
              return (
                <button
                  key={date}
                  onClick={() => setSelected(date)}
                  className={cn(
                    "flex aspect-square flex-col items-center justify-center rounded-md border text-sm transition-colors",
                    isSelected
                      ? "border-gold bg-gold/10 text-gold"
                      : entry
                        ? "border-teal/40 bg-teal/5 text-text-primary hover:border-teal"
                        : "border-border bg-surface text-text-secondary hover:border-gold-muted"
                  )}
                >
                  <span className="tabular-nums">{day}</span>
                  {entry && (
                    <span className="mt-0.5 font-mono text-[9px] text-teal">{entry.verseRef}</span>
                  )}
                </button>
              );
            })}
          </div>
          {loading && <StateNote>Loading…</StateNote>}
        </div>

        <DayEditor
          // Re-key on the entry's content too, so the editor re-initialises when an
          // async reload changes the curated entry for the same selected day.
          key={`${selected ?? "none"}:${selected ? (byDate.get(selected)?.updatedAt ?? "new") : ""}`}
          date={selected}
          existing={selected ? (byDate.get(selected) ?? null) : null}
          onSaved={reload}
        />
      </div>
    </>
  );
}

function DayEditor({
  date,
  existing,
  onSaved,
}: {
  date: string | null;
  existing: Entry | null;
  onSaved: () => void;
}) {
  const api = useAdminFetch();
  const [verseRef, setVerseRef] = useState(existing?.verseRef ?? "");
  const [reflection, setReflection] = useState(existing?.reflection ?? "");
  const [preview, setPreview] = useState<Verse | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (!date) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-text-muted">
        Select a day to set or clear its verse.
      </div>
    );
  }

  const doPreview = async () => {
    setMsg(null);
    setPreview(null);
    const match = /^(\d+):(\d+)$/.exec(verseRef.trim());
    if (!match) {
      setMsg("Enter a reference like 2:255.");
      return;
    }
    try {
      const v = await fetch(`/api/verse/${match[1]}/${match[2]}`);
      if (!v.ok) {
        setMsg("That verse could not be found.");
        return;
      }
      setPreview((await v.json()) as Verse);
    } catch {
      setMsg("Preview failed.");
    }
  };

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await api("/votd", { method: "PUT", json: { date, verseRef: verseRef.trim(), reflection } });
      setMsg("Saved.");
      onSaved();
    } catch (e) {
      setMsg(e instanceof AdminApiError ? e.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await api(`/votd?date=${date}`, { method: "DELETE" });
      setMsg("Cleared.");
      onSaved();
    } catch (e) {
      setMsg(e instanceof AdminApiError ? e.message : "Clear failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 rounded-lg border border-border bg-surface p-5">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted">
          Editing
        </div>
        <div className="text-sm text-text-primary">{date}</div>
      </div>

      <label className="block space-y-1.5">
        <span className="text-xs text-text-secondary">Verse reference</span>
        <div className="flex gap-2">
          <Input
            value={verseRef}
            onChange={(e) => setVerseRef(e.target.value)}
            placeholder="e.g. 2:255"
          />
          <Button size="md" variant="secondary" onClick={doPreview}>
            Preview
          </Button>
        </div>
      </label>

      {preview && (
        <div className="space-y-2 rounded-md border border-border-subtle bg-bg p-3">
          <p dir="rtl" className="font-arabic text-right text-lg leading-loose text-text-primary">
            {preview.arabicText}
          </p>
          <p className="text-xs leading-relaxed text-text-secondary">{preview.translation}</p>
        </div>
      )}

      <label className="block space-y-1.5">
        <span className="text-xs text-text-secondary">Reflection (optional, editorial)</span>
        <textarea
          value={reflection}
          onChange={(e) => setReflection(e.target.value)}
          rows={4}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-gold-muted"
          placeholder="A short reflection shown beneath the verse…"
        />
      </label>

      {reflection.trim() && <ReflectionNote>{reflection}</ReflectionNote>}

      <div className="flex items-center gap-2">
        <Button variant="primary" onClick={save} disabled={busy || !verseRef.trim()}>
          {existing ? "Update" : "Set verse"}
        </Button>
        {existing && (
          <ConfirmButton onConfirm={clear} disabled={busy} confirmLabel="Clear day?">
            Clear
          </ConfirmButton>
        )}
      </div>

      {msg && <p className="text-xs text-text-secondary">{msg}</p>}
    </div>
  );
}
