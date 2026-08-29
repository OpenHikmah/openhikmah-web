"use client";

import { useState } from "react";
import Link from "next/link";
import { StateNote, ConfirmButton } from "@/components/admin/primitives";
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
  const [maxCalls, setMaxCalls] = useState(200);
  const [maxCostUsd, setMaxCostUsd] = useState(5);
  const [runNote, setRunNote] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const startRun = async () => {
    setRunNote(null);
    setRunError(null);
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
    <section className="rounded-lg border border-border bg-surface p-4">
      <h3 className="text-sm font-semibold text-text-primary">Run the backfill job</h3>
      <p className="mt-1 text-xs text-text-muted">
        Generates connections for verses that have none (baseline) or tops up the thinnest cells
        (top-up). Resumable — already-generated connections are never regenerated, and a cell with no
        more real connections is marked exhausted so it is never re-run.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs">
          <span className="mb-1 block text-text-muted">Mode</span>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as "baseline" | "topup")}
            className="w-full rounded border border-border bg-bg px-2 py-1.5"
          >
            <option value="baseline">baseline — fill cells with zero connections</option>
            <option value="topup">top-up — add more to the thinnest cells</option>
          </select>
        </label>

        <label className="text-xs">
          <span className="mb-1 block text-text-muted">Provider</span>
          <select
            value={provider}
            onChange={(e) => {
              setProvider(e.target.value as "claude" | "gemini");
              setModel("");
            }}
            className="w-full rounded border border-border bg-bg px-2 py-1.5"
          >
            <option value="gemini">gemini — cheapest</option>
            <option value="claude">claude — highest fidelity</option>
          </select>
        </label>

        <label className="text-xs">
          <span className="mb-1 block text-text-muted">Model</span>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full rounded border border-border bg-bg px-2 py-1.5"
          >
            <option value="">default</option>
            {SELECTABLE_MODELS[provider].map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>

        <div className="text-xs">
          <span className="mb-1 block text-text-muted">Also translate reasons into</span>
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

        <div className="grid grid-cols-2 gap-3 text-xs">
          <label>
            <span className="mb-1 block text-text-muted">Max LLM calls</span>
            <input
              type="number"
              min={1}
              value={maxCalls}
              onChange={(e) => setMaxCalls(Number(e.target.value))}
              className="w-full rounded border border-border bg-bg px-2 py-1.5 tabular-nums"
            />
          </label>
          <label>
            <span className="mb-1 block text-text-muted">Max cost (USD, est.)</span>
            <input
              type="number"
              min={0.1}
              step={0.1}
              value={maxCostUsd}
              onChange={(e) => setMaxCostUsd(Number(e.target.value))}
              className="w-full rounded border border-border bg-bg px-2 py-1.5 tabular-nums"
            />
          </label>
        </div>
      </div>

      <p className="mt-2 text-[11px] text-text-muted">
        The job stops cleanly at whichever limit is hit first. Max calls is exact; max cost is a
        per-call estimate (token counts aren&apos;t tracked on this path).
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

      <div className="mt-3">
        <ConfirmButton
          variant="secondary"
          disabled={starting}
          onConfirm={startRun}
          confirmLabel={`Run ${mode} on ${provider}?`}
        >
          {starting ? "Starting…" : "Run backfill"}
        </ConfirmButton>
      </div>
    </section>
  );
}
