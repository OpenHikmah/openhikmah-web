"use client";

import { useState, useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button, Input, ReflectionNote } from "@/components/ui";
import { cn } from "@/lib/utils";
import { AdminPageHeader } from "@/components/admin/AdminShell";
import { StateNote, ConfirmButton } from "@/components/admin/primitives";
import { useAdminFetch, AdminApiError } from "@/components/admin/AdminContext";
import { useAsync } from "@/components/admin/useAsync";
import type { Verse } from "@/types/quran";

interface Entry {
  date: string;
  verseRef: string;
  reflection: string | null;
  updatedAt: string;
}

interface TodayInfo {
  date: string;
  ref: string;
  arabicText: string;
  translation: string;
  reflection: string | null;
  source: "curated" | "algorithmic";
}

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function daysInMonthOf(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

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

function longDate(date: string): string {
  const [dy, dm, dd] = date.split("-").map(Number);
  return new Date(Date.UTC(dy, dm - 1, dd)).toLocaleString("en", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

const todayStr = () => new Date().toISOString().slice(0, 10);

function addDays(date: string, delta: number): string {
  const [dy, dm, dd] = date.split("-").map(Number);
  const d = new Date(Date.UTC(dy, dm - 1, dd + delta));
  return d.toISOString().slice(0, 10);
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

  const { data, error, loading, reload } = useAsync<{ entries: Entry[]; today: TodayInfo | null }>(
    () => api(`/votd?month=${month}`),
    `votd:${month}`
  );

  const byDate = new Map((data?.entries ?? []).map((e) => [e.date, e]));
  const [y, m] = month.split("-").map(Number);
  const firstWeekday = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const today = todayStr();

  const gridRef = useRef<HTMLDivElement>(null);
  // After an arrow-key move changes the month, focus the target day once its
  // button has rendered.
  const pendingFocus = useRef<string | null>(null);
  useEffect(() => {
    if (!pendingFocus.current) return;
    const el = gridRef.current?.querySelector<HTMLButtonElement>(
      `[data-date="${pendingFocus.current}"]`
    );
    el?.focus();
    pendingFocus.current = null;
  }, [month, data]);

  // The one day in the grid that's tab-reachable (roving tabindex): the
  // selection if it's in this month, else today if visible, else day 1.
  const rovingDate =
    selected && selected.startsWith(month)
      ? selected
      : today.startsWith(month)
        ? today
        : `${month}-01`;

  // Lay the month out as calendar weeks so the grid can carry `role="row"`
  // containers — a bare grid of gridcells isn't a valid grid.
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const moveTo = (date: string) => {
    setSelected(date);
    if (date.slice(0, 7) !== month) {
      pendingFocus.current = date;
      setMonth(date.slice(0, 7));
    } else {
      gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${date}"]`)?.focus();
    }
  };

  const onGridKeyDown = (e: React.KeyboardEvent) => {
    const from = rovingDate;
    let target: string | null = null;
    switch (e.key) {
      case "ArrowRight":
        target = addDays(from, 1);
        break;
      case "ArrowLeft":
        target = addDays(from, -1);
        break;
      case "ArrowDown":
        target = addDays(from, 7);
        break;
      case "ArrowUp":
        target = addDays(from, -7);
        break;
      case "Home":
        // Start of the active week (may cross into the previous month).
        target = addDays(from, -weekdayOf(from));
        break;
      case "End":
        target = addDays(from, 6 - weekdayOf(from));
        break;
      case "PageUp":
      case "PageDown": {
        const dest = addMonth(month, e.key === "PageUp" ? -1 : 1);
        const dom = Math.min(Number(from.slice(8, 10)), daysInMonthOf(dest));
        target = `${dest}-${String(dom).padStart(2, "0")}`;
        break;
      }
      default:
        return;
    }
    e.preventDefault();
    moveTo(target);
  };

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

          <div
            ref={gridRef}
            role="grid"
            aria-label={`${monthLabel(month)} — set the verse of the day`}
            onKeyDown={onGridKeyDown}
            className="flex flex-col gap-1.5"
          >
            <div role="row" className="grid grid-cols-7 gap-1.5">
              {WEEKDAYS.map((d, i) => (
                <div
                  key={i}
                  role="columnheader"
                  aria-label={WEEKDAY_NAMES[i]}
                  className="pb-1 text-center font-mono text-[10px] uppercase text-text-muted"
                >
                  {d}
                </div>
              ))}
            </div>
            {weeks.map((week, wi) => (
              <div key={wi} role="row" className="grid grid-cols-7 gap-1.5">
                {week.map((day, ci) => {
                  if (day === null) return <div key={ci} role="gridcell" aria-hidden />;
                  const date = `${month}-${String(day).padStart(2, "0")}`;
                  const entry = byDate.get(date);
                  const isSelected = selected === date;
                  const isToday = date === today;
                  return (
                    <div
                      key={date}
                      role="gridcell"
                      aria-selected={isSelected}
                      className="aspect-square"
                    >
                      <button
                        data-date={date}
                        tabIndex={date === rovingDate ? 0 : -1}
                        aria-current={isToday ? "date" : undefined}
                        aria-label={`${longDate(date)}${
                          entry ? `, verse ${entry.verseRef}` : ", no verse set"
                        }${isToday ? ", today" : ""}`}
                        onClick={() => setSelected(date)}
                        className={cn(
                          "flex h-full w-full flex-col items-center justify-center rounded-md border text-sm transition-colors",
                          isSelected
                            ? "border-gold bg-gold/10 text-gold"
                            : entry
                              ? "border-teal/40 bg-teal/5 text-text-primary hover:border-teal"
                              : "border-border bg-surface text-text-secondary hover:border-gold-muted",
                          // Marks the live day independent of curated/selected color, so
                          // it's identifiable even on an uncurated (algorithmic-pick) day.
                          isToday && !isSelected && "ring-1 ring-inset ring-gold/50"
                        )}
                      >
                        <span className="tabular-nums">{day}</span>
                        {entry ? (
                          <span className="mt-0.5 font-mono text-[9px] text-teal">
                            {entry.verseRef}
                          </span>
                        ) : (
                          // No curated entry — for today, still surface the live
                          // algorithmic pick so the admin can see it without leaving
                          // the calendar, styled distinctly from a curated ref.
                          isToday &&
                          data?.today?.ref && (
                            <span className="mt-0.5 font-mono text-[9px] text-gold">
                              {data.today.ref}
                            </span>
                          )
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          {loading && <StateNote>Loading…</StateNote>}
        </div>

        <DayEditor
          // Re-key on the entry's content too, so the editor re-initialises when an
          // async reload changes the curated entry for the same selected day.
          key={`${selected ?? "none"}:${selected ? (byDate.get(selected)?.updatedAt ?? "new") : ""}`}
          date={selected}
          existing={selected ? (byDate.get(selected) ?? null) : null}
          todayRef={data?.today?.date === selected ? (data.today.ref ?? null) : null}
          onSaved={reload}
        />
      </div>
    </>
  );
}

function DayEditor({
  date,
  existing,
  todayRef,
  onSaved,
}: {
  date: string | null;
  existing: Entry | null;
  /** Today's live (algorithmic) pick, when `date` is today and nothing is
   *  curated yet — pre-fills the form so the admin can see what's currently
   *  showing and either keep it (save as-is) or overwrite it. */
  todayRef?: string | null;
  onSaved: () => void;
}) {
  const api = useAdminFetch();
  const [verseRef, setVerseRef] = useState(existing?.verseRef ?? todayRef ?? "");
  const [reflection, setReflection] = useState(existing?.reflection ?? "");
  const [preview, setPreview] = useState<Verse | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // `todayRef` arrives from an async fetch (useAsync) that can resolve after
  // this component has already mounted with it still null/undefined — sync
  // the field once it lands, but only while the admin hasn't started typing,
  // so a resolution arriving after they've edited the field never clobbers it.
  const touchedRef = useRef(false);

  useEffect(() => {
    if (!existing && !touchedRef.current && todayRef) {
      setVerseRef(todayRef);
    }
  }, [existing, todayRef]);

  if (!date) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-text-muted">
        Select a day to set or clear its verse.
      </div>
    );
  }

  const doPreview = async () => {
    if (previewBusy) return;
    setMsg(null);
    setPreview(null);
    const match = /^(\d+):(\d+)$/.exec(verseRef.trim());
    if (!match) {
      setMsg("Enter a reference like 2:255.");
      return;
    }
    setPreviewBusy(true);
    try {
      const v = await fetch(`/api/verse/${match[1]}/${match[2]}`);
      if (!v.ok) {
        setMsg("That verse could not be found.");
        return;
      }
      setPreview((await v.json()) as Verse);
    } catch {
      setMsg("Preview failed.");
    } finally {
      setPreviewBusy(false);
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
            onChange={(e) => {
              touchedRef.current = true;
              setVerseRef(e.target.value);
            }}
            placeholder="e.g. 2:255"
          />
          <Button size="md" variant="secondary" onClick={doPreview} disabled={previewBusy}>
            {previewBusy ? "Previewing…" : "Preview"}
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
