"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Input, NativeSelect } from "@/components/ui";
import { StateNote, ConfirmButton, Panel } from "@/components/admin/primitives";
import { Field } from "@/components/admin/Field";
import { SectionHeading } from "@/components/admin/SectionHeading";
import { useAdminFetch, AdminApiError } from "@/components/admin/AdminContext";
import type { Locale } from "@/lib/i18n/config";
import { SELECTABLE_MODELS } from "@/lib/ai/models";

const TARGET_LOCALES: Exclude<Locale, "en">[] = ["tr", "ru", "az"];

const DEFAULT_CALL_DELAY_MS = 1500;
const MAX_CALL_DELAY_MS = 60_000;

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
 *
 * "Loop" mode (Gemini-only, free tier): the job re-runs pass after pass,
 * rotating through the selected `GEMINI_API1..5` keys, advancing to the next key
 * only when the current one hits its per-day quota, and pacing every LLM call by
 * the given delay. It stops when every selected key is daily-exhausted, the work
 * list is fully covered, the admin clicks Stop, or an optional safety budget cap
 * is reached. Per-minute 429s are waited out and retried, never fatal.
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

  const [loop, setLoop] = useState(false);
  const [geminiKeys, setGeminiKeys] = useState<string[] | null>(null);
  const [keysError, setKeysError] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Record<string, boolean>>({});
  const [callDelayMs, setCallDelayMs] = useState<number | "">(DEFAULT_CALL_DELAY_MS);

  const [runNote, setRunNote] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<{ keys: string[] }>("/gemini-keys")
      .then((r) => {
        if (cancelled) return;
        setKeysError(false);
        setGeminiKeys(r.keys);
        // Seed the selection once, on first load — a token refresh re-runs this
        // effect (api is memoised on the access token) and must not silently
        // re-check keys the admin deliberately unticked.
        setSelectedKeys((prev) =>
          Object.keys(prev).length > 0 ? prev : Object.fromEntries(r.keys.map((k) => [k, true]))
        );
      })
      .catch(() => {
        if (cancelled) return;
        // Distinguish "couldn't check" from "none configured" — otherwise an auth
        // blip reads as "set your env vars" (which are already fine).
        setKeysError(true);
        setGeminiKeys((prev) => prev ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  const selectedKeyList = (geminiKeys ?? []).filter((k) => selectedKeys[k]);
  const delayInvalid =
    callDelayMs === "" ||
    !Number.isInteger(callDelayMs) ||
    callDelayMs < 0 ||
    callDelayMs > MAX_CALL_DELAY_MS;
  const budgetInvalid = (v: number | "") => v !== "" && (!Number.isFinite(v) || v <= 0);
  const budgetsInvalid = maxCalls === "" || maxCostUsd === "" || maxCalls <= 0 || maxCostUsd <= 0;
  const formInvalid = loop
    ? delayInvalid ||
      selectedKeyList.length === 0 ||
      budgetInvalid(maxCalls) ||
      budgetInvalid(maxCostUsd)
    : budgetsInvalid;

  const toggleLoop = (checked: boolean) => {
    setLoop(checked);
    if (checked && provider !== "gemini") {
      setProvider("gemini");
      setModel("");
    }
  };

  const startRun = async () => {
    setRunNote(null);
    setRunError(null);
    if (formInvalid) return;
    setStarting(true);
    try {
      await api("/jobs", {
        method: "POST",
        json: {
          jobId: "backfill-connections",
          params: {
            mode,
            provider: loop ? "gemini" : provider,
            ...(model ? { model } : {}),
            locales: TARGET_LOCALES.filter((l) => runLocales[l]).join(","),
            ...(loop
              ? {
                  loop: true,
                  keys: selectedKeyList,
                  callDelayMs: callDelayMs === "" ? DEFAULT_CALL_DELAY_MS : callDelayMs,
                  ...(maxCalls !== "" ? { maxCalls } : {}),
                  ...(maxCostUsd !== "" ? { maxCostUsd } : {}),
                }
              : { maxCalls, maxCostUsd }),
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
            value={loop ? "gemini" : provider}
            disabled={loop}
            onChange={(e) => {
              setProvider(e.target.value as "claude" | "gemini");
              setModel("");
            }}
          >
            <option value="gemini">gemini — cheapest</option>
            <option value="claude" disabled={loop}>
              claude — highest fidelity
            </option>
          </NativeSelect>
        </Field>

        <Field label="Model">
          <NativeSelect value={model} onChange={(e) => setModel(e.target.value)}>
            <option value="">default</option>
            {SELECTABLE_MODELS[loop ? "gemini" : provider].map((m) => (
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
          <Field label={loop ? "Max LLM calls (optional)" : "Max LLM calls"}>
            <Input
              type="number"
              min={1}
              value={maxCalls}
              placeholder={loop ? "unbounded" : "required"}
              onChange={(e) => setMaxCalls(e.target.value === "" ? "" : Number(e.target.value))}
              className="tabular-nums"
            />
          </Field>
          <Field label={loop ? "Max cost (optional cap)" : "Max cost (USD, est.)"}>
            <Input
              type="number"
              min={0.1}
              step={0.1}
              value={maxCostUsd}
              placeholder={loop ? "unbounded" : "required"}
              onChange={(e) => setMaxCostUsd(e.target.value === "" ? "" : Number(e.target.value))}
              className="tabular-nums"
            />
          </Field>
        </div>
      </div>

      <div className="mt-4 border-t border-border pt-3">
        <label className="flex items-start gap-2 text-xs">
          <input
            type="checkbox"
            checked={loop}
            className="mt-0.5"
            onChange={(e) => toggleLoop(e.target.checked)}
          />
          <span>
            <span className="text-text-secondary">
              Loop — keep running, rotating Gemini keys, until every selected key hits its daily
              quota
            </span>
            <span className="mt-0.5 block text-text-muted">
              Gemini-only (free tier). Per-minute rate limits are waited out and retried; only a
              per-day quota rotates to the next key. Stop a run from the{" "}
              <Link href="/admin/jobs" className="underline">
                Jobs page
              </Link>
              .
            </span>
          </span>
        </label>

        {loop && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="text-xs">
              <span className="mb-1 block text-text-secondary">Gemini keys (rotation order)</span>
              {geminiKeys === null ? (
                <span className="text-text-muted">Loading…</span>
              ) : keysError ? (
                <span className="text-text-muted">
                  Couldn&apos;t load the key list — reload the page to retry.
                </span>
              ) : geminiKeys.length === 0 ? (
                <span className="text-text-muted">
                  No GEMINI_API1..5 keys configured — set them in the environment to use loop mode.
                </span>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {geminiKeys.map((k) => (
                    <label key={k} className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={selectedKeys[k] ?? false}
                        onChange={(e) => setSelectedKeys((s) => ({ ...s, [k]: e.target.checked }))}
                      />
                      {k}
                    </label>
                  ))}
                </div>
              )}
            </div>

            <Field
              label="Delay between LLM calls (ms)"
              hint="~1500 ms ≈ 3 calls / 4.5 s. A higher delay lowers the risk of per-minute 429s (which are auto-retried anyway)."
            >
              <Input
                type="number"
                min={0}
                max={MAX_CALL_DELAY_MS}
                step={100}
                value={callDelayMs}
                onChange={(e) =>
                  setCallDelayMs(e.target.value === "" ? "" : Number(e.target.value))
                }
                className="tabular-nums"
              />
            </Field>
          </div>
        )}
      </div>

      <p className="mt-2 text-[11px] text-text-muted">
        {loop ? (
          <>
            In loop mode both budget fields are optional safety caps — leave them blank to run until
            the keys are exhausted or you click Stop. Free-tier keys cost $0, so the $ figure shown
            on the Jobs page is a notional list price.
          </>
        ) : (
          <>
            Max LLM calls and Max cost are both required — there is no default, so a stray click can
            never start a run. The job stops cleanly at whichever limit is hit first: max calls is
            exact; max cost is a per-call estimate (token counts aren&apos;t tracked on this path).
            Stop a run in progress from the{" "}
            <Link href="/admin/jobs" className="underline">
              Jobs page
            </Link>
            .
          </>
        )}
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

      {formInvalid && (
        <p className="mt-2 text-[11px] text-text-muted">
          {loop
            ? "Select at least one Gemini key and a valid delay to enable the run."
            : "Enter Max LLM calls and Max cost to enable the run."}
        </p>
      )}

      <div className="mt-3">
        <ConfirmButton
          variant="secondary"
          disabled={starting || formInvalid}
          onConfirm={startRun}
          confirmLabel={
            loop
              ? `Loop ${mode} on ${selectedKeyList.length} key(s)?`
              : `Run ${mode} on ${provider}?`
          }
        >
          {starting ? "Starting…" : loop ? "Start loop" : "Run backfill"}
        </ConfirmButton>
      </div>
    </Panel>
  );
}
