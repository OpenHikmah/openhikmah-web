"use client";

import { useState } from "react";
import Link from "next/link";
import { Input, NativeSelect } from "@/components/ui";
import { StateNote, ConfirmButton, Panel } from "@/components/admin/primitives";
import { Field } from "@/components/admin/Field";
import { SectionHeading } from "@/components/admin/SectionHeading";
import { useAdminFetch, AdminApiError } from "@/components/admin/AdminContext";
import type { Locale } from "@/lib/i18n/config";
import { SELECTABLE_MODELS } from "@/lib/ai/models";

const TARGET_LOCALES: Exclude<Locale, "en">[] = ["tr", "ru", "az"];

/**
 * The "Run the backfill job" console. Its inputs are deliberately kept in a
 * standalone component with no dependency on the coverage report fetch, so a
 * transient `/coverage` reload failure can never unmount the form and wipe the
 * values an admin just typed (e.g. while retrying against an "already running"
 * job).
 *
 * This form does NOT track whether a job is running — starting a second run is
 * rejected server-side with a visible "already running" message, and stopping a
 * run lives on the Jobs page. The budget fields (max calls / max cost) have no
 * default value on purpose: an accidental "Run backfill" click must not be able
 * to start a run that spends money.
 */
export function BackfillRunner({ onStarted }: { onStarted?: () => void }) {
  const api = useAdminFetch();
  const [mode, setMode] = useState<"baseline" | "topup">("baseline");
  const [provider, setProvider] = useState<"claude" | "gemini">("gemini");
  const [model, setModel] = useState("");
  const [runLocales, setRunLocales] = useState<Record<string, boolean>>({
    tr: true,
    ru: true,
    az: true,
  });
  const [maxCalls, setMaxCalls] = useState<number | "">("");
  const [maxCostUsd, setMaxCostUsd] = useState<number | "">("");
  const [runNote, setRunNote] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const budgetsInvalid = maxCalls === "" || maxCostUsd === "" || maxCalls <= 0 || maxCostUsd <= 0;

  const startRun = async () => {
    setRunNote(null);
    setRunError(null);
    if (budgetsInvalid) return;
    setStarting(true);
    try {
      await api("/jobs", {
        method: "POST",
        json: {
          jobId: "backfill-connections",
          params: {
            mode,
            provider,
            ...(model ? { model } : {}),
            locales: TARGET_LOCALES.filter((l) => runLocales[l]).join(","),
            maxCalls,
            maxCostUsd,
          },
        },
      });
      setRunNote("Started. Watch progress on the Jobs page.");
      onStarted?.();
    } catch (e) {
      setRunError(e instanceof AdminApiError ? e.message : "Failed to start the backfill job.");
    } finally {
      setStarting(false);
    }
  };

  return (
    <Panel>
      <SectionHeading title="Run the backfill job" />
      <p className="mt-1 text-xs text-text-muted">
        Generates connections for verses that have none (baseline) or tops up the thinnest cells
        (top-up). Resumable — already-generated connections are never regenerated, and a cell with
        no more real connections is marked exhausted so it is never re-run.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Mode">
          <NativeSelect
            value={mode}
            onChange={(e) => setMode(e.target.value as "baseline" | "topup")}
          >
            <option value="baseline">baseline — fill cells with zero connections</option>
            <option value="topup">top-up — add more to the thinnest cells</option>
          </NativeSelect>
        </Field>

        <Field label="Provider">
          <NativeSelect
            value={provider}
            onChange={(e) => {
              setProvider(e.target.value as "claude" | "gemini");
              setModel("");
            }}
          >
            <option value="gemini">gemini — cheapest</option>
            <option value="claude">claude — highest fidelity</option>
          </NativeSelect>
        </Field>

        <Field label="Model">
          <NativeSelect value={model} onChange={(e) => setModel(e.target.value)}>
            <option value="">default</option>
            {SELECTABLE_MODELS[provider].map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </NativeSelect>
        </Field>

        <div className="text-xs">
          <span className="mb-1 block text-text-secondary">Also translate reasons into</span>
          <div className="flex gap-3">
            {TARGET_LOCALES.map((l) => (
              <label key={l} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={runLocales[l] ?? false}
                  onChange={(e) => setRunLocales((s) => ({ ...s, [l]: e.target.checked }))}
                />
                {l.toUpperCase()}
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Max LLM calls">
            <Input
              type="number"
              min={1}
              value={maxCalls}
              placeholder="required"
              onChange={(e) => setMaxCalls(e.target.value === "" ? "" : Number(e.target.value))}
              className="tabular-nums"
            />
          </Field>
          <Field label="Max cost (USD, est.)">
            <Input
              type="number"
              min={0.1}
              step={0.1}
              value={maxCostUsd}
              placeholder="required"
              onChange={(e) => setMaxCostUsd(e.target.value === "" ? "" : Number(e.target.value))}
              className="tabular-nums"
            />
          </Field>
        </div>
      </div>

      <p className="mt-2 text-[11px] text-text-muted">
        Max LLM calls and Max cost are both required — there is no default, so a stray click can
        never start a run. The job stops cleanly at whichever limit is hit first: max calls is
        exact; max cost is a per-call estimate (token counts aren&apos;t tracked on this path). Stop
        a run in progress from the{" "}
        <Link href="/admin/jobs" className="underline">
          Jobs page
        </Link>
        .
      </p>

      {runError && <StateNote tone="error">{runError}</StateNote>}
      {runNote && (
        <p className="mt-2 text-xs text-teal">
          {runNote}{" "}
          <Link href="/admin/jobs" className="underline">
            Open Jobs
          </Link>
        </p>
      )}

      {budgetsInvalid && (
        <p className="mt-2 text-[11px] text-text-muted">
          Enter Max LLM calls and Max cost to enable the run.
        </p>
      )}

      <div className="mt-3">
        <ConfirmButton
          variant="secondary"
          disabled={starting || budgetsInvalid}
          onConfirm={startRun}
          confirmLabel={`Run ${mode} on ${provider}?`}
        >
          {starting ? "Starting…" : "Run backfill"}
        </ConfirmButton>
      </div>
    </Panel>
  );
}
