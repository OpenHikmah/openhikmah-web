"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Input, NativeSelect } from "@/components/ui";
import { StateNote, ConfirmButton, Panel } from "@/components/admin/primitives";
import { Field } from "@/components/admin/Field";
import { SectionHeading } from "@/components/admin/SectionHeading";
import { useAdminFetch, AdminApiError } from "@/components/admin/AdminContext";
import { SELECTABLE_MODELS } from "@/lib/ai/models";
import type { TranslationProgress, VerificationProgress } from "@/lib/ai/verification-progress";

const GEMINI_DEFAULT_DELAY_MS = 1500;
const MAX_CALL_DELAY_MS = 60_000;

const nf = new Intl.NumberFormat("en-US");

type Variant = "connections" | "translations";
const JOB_IDS = {
  connections: "verify-connections",
  translations: "verify-translations",
} as const;

/** The same panel for the translation re-check: one bar over all translated rows, plus per language. */
function TranslationProgressBlock({
  progress,
  error,
  onRefresh,
}: {
  progress: TranslationProgress | null;
  error: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="mt-4 rounded border border-border p-3 text-xs" aria-live="polite">
      <div className="flex items-center justify-between">
        <span className="text-text-secondary">Translation check progress</span>
        <button type="button" className="underline text-text-muted" onClick={onRefresh}>
          Refresh
        </button>
      </div>
      {progress ? (
        <>
          <progress
            className="mt-2 h-2 w-full"
            aria-label="Translations checked"
            max={Math.max(progress.rows.total, 1)}
            value={progress.rows.done}
          />
          <p className="mt-2 tabular-nums">
            <span className="text-text-secondary">
              {progress.rows.percent}% of translations checked
            </span>
            {": "}
            {nf.format(progress.rows.done)} of {nf.format(progress.rows.total)}
            {", "}
            {nf.format(progress.rows.remaining)} remaining
          </p>
          <p className="mt-1 tabular-nums text-text-muted">
            {Object.entries(progress.byLocale)
              .map(
                ([locale, v]) =>
                  `${locale.toUpperCase()} ${nf.format(v.done)} of ${nf.format(v.total)}`
              )
              .join(" | ")}
          </p>
          <p className="mt-1 text-text-muted">
            Translations the check flags are hidden (users see the English) and drop out of these
            totals. Hidden so far: {nf.format(progress.hidden)}.
          </p>
        </>
      ) : (
        <p className="mt-2 text-text-muted">
          {error ? "Could not load the progress. Try Refresh." : "Loading…"}
        </p>
      )}
    </div>
  );
}

/** How much of the backlog is verified: a bar plus the numbers, refreshable. */
function ProgressBlock({
  progress,
  error,
  onRefresh,
}: {
  progress: VerificationProgress | null;
  error: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="mt-4 rounded border border-border p-3 text-xs" aria-live="polite">
      <div className="flex items-center justify-between">
        <span className="text-text-secondary">Verification progress</span>
        <button type="button" className="underline text-text-muted" onClick={onRefresh}>
          Refresh
        </button>
      </div>
      {progress ? (
        <>
          <progress
            className="mt-2 h-2 w-full"
            aria-label="Connections verified"
            max={Math.max(progress.connections.total, 1)}
            value={progress.connections.done}
          />
          <p className="mt-2 tabular-nums">
            <span className="text-text-secondary">
              {progress.connections.percent}% of connections verified
            </span>
            {": "}
            {nf.format(progress.connections.done)} of {nf.format(progress.connections.total)}
            {", "}
            {nf.format(progress.connections.remaining)} remaining
          </p>
          <p className="mt-1 tabular-nums text-text-muted">
            Verses fully verified: {nf.format(progress.verses.done)} of{" "}
            {nf.format(progress.verses.total)} ({progress.verses.percent}%),{" "}
            {nf.format(progress.verses.remaining)} remaining
          </p>
          <p className="mt-1 tabular-nums text-text-muted">
            Verifier calls (verse + kind): {nf.format(progress.cells.done)} of{" "}
            {nf.format(progress.cells.total)} done, {nf.format(progress.cells.remaining)} remaining
          </p>
          <p className="mt-1 text-text-muted">
            Connections the verifier flags are hidden and drop out of these totals. Hidden so far:{" "}
            {nf.format(progress.hidden)}.
          </p>
        </>
      ) : (
        <p className="mt-2 text-text-muted">
          {error ? "Could not load the progress. Try Refresh." : "Loading…"}
        </p>
      )}
    </div>
  );
}

/**
 * The "Re-verify existing connections" console. Runs every active English
 * connection that has not been verified yet through the same verifier new
 * connections pass at generation, and flags the ones it does not approve (in
 * every language) for the review queue. Like the backfill form, both budgets
 * are required and have no default, so a stray click can never start a run that
 * spends money; progress and Stop live on the Jobs page.
 *
 * "Loop" mode (Gemini-only, free tier), the same as the backfill form: the job
 * runs pass after pass, rotating through the selected GEMINI_API1..5 keys and
 * moving to the next only when the current one hits its daily quota, until
 * nothing is left to verify (the job log then says ALL DONE), every key is
 * spent, or the admin clicks Stop. Both budgets are then optional safety caps.
 */
export function VerifyRunner({
  onStarted,
  variant = "connections",
}: {
  onStarted?: () => void;
  variant?: Variant;
}) {
  const api = useAdminFetch();
  const [provider, setProvider] = useState<"claude" | "gemini">("gemini");
  const [model, setModel] = useState("");
  const [maxCalls, setMaxCalls] = useState<number | "">("");
  const [maxCostUsd, setMaxCostUsd] = useState<number | "">("");
  const [callDelayMs, setCallDelayMs] = useState<number | "">(GEMINI_DEFAULT_DELAY_MS);

  const [progress, setProgress] = useState<VerificationProgress | TranslationProgress | null>(null);
  const [progressError, setProgressError] = useState(false);
  const fetchProgress = useCallback(
    () =>
      api<{ connections?: VerificationProgress; translations?: TranslationProgress }>(
        "/verification"
      ).then((r) => {
        const slice = variant === "translations" ? r.translations : r.connections;
        if (!slice) throw new Error("no progress in response");
        return slice;
      }),
    [api, variant]
  );
  // Scans overlap (poll tick + the final refresh); only the latest response may land.
  const progressSeq = useRef(0);
  const loadProgress = useCallback(() => {
    const seq = ++progressSeq.current;
    fetchProgress()
      .then((p) => {
        if (seq !== progressSeq.current) return;
        setProgress(p);
        setProgressError(false);
      })
      .catch(() => {
        if (seq === progressSeq.current) setProgressError(true);
      });
  }, [fetchProgress]);
  useEffect(() => {
    loadProgress();
    return () => {
      // Not a DOM ref: the latest counter value is what invalidates in-flight scans.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      progressSeq.current++;
    };
  }, [loadProgress]);

  const [jobRunning, setJobRunning] = useState(false);
  const [statusError, setStatusError] = useState(false);
  const wasRunning = useRef(false);
  const refreshRunning = useCallback(
    () =>
      api<{ jobs: { id: string; status: string }[] }>("/jobs")
        .then((r) => {
          const running = r.jobs.some((j) => j.id === JOB_IDS[variant] && j.status === "running");
          // The last tick's progress scan can finish before the job's final write.
          if (wasRunning.current && !running) loadProgress();
          wasRunning.current = running;
          setJobRunning(running);
          setStatusError(false);
        })
        .catch(() => setStatusError(true)),
    [api, variant, loadProgress]
  );
  useEffect(() => {
    void refreshRunning();
  }, [refreshRunning]);
  // Poll only while this job runs (the progress query scans every connection), and pause
  // when the status check fails so a broken /jobs cannot keep hammering the database.
  useEffect(() => {
    if (!jobRunning || statusError) return;
    const id = setInterval(() => {
      loadProgress();
      void refreshRunning();
    }, 4000);
    return () => clearInterval(id);
  }, [jobRunning, statusError, loadProgress, refreshRunning]);
  const refreshAll = useCallback(() => {
    loadProgress();
    void refreshRunning();
  }, [loadProgress, refreshRunning]);

  const [loop, setLoop] = useState(false);
  const [geminiKeys, setGeminiKeys] = useState<string[] | null>(null);
  const [keysError, setKeysError] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Record<string, boolean>>({});

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
        // Seed the selection once: a token refresh re-runs this effect and must
        // not re-check keys the admin deliberately unticked.
        setSelectedKeys((prev) =>
          Object.keys(prev).length > 0 ? prev : Object.fromEntries(r.keys.map((k) => [k, true]))
        );
      })
      .catch(() => {
        if (cancelled) return;
        // "Could not check" is not "none configured": an auth blip must not read
        // as "set your env vars".
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
  const budgetsInvalid = maxCalls === "" || maxCostUsd === "" || maxCalls <= 0 || maxCostUsd <= 0;
  const budgetInvalid = (v: number | "") => v !== "" && (!Number.isFinite(v) || v <= 0);
  const formInvalid = loop
    ? delayInvalid ||
      selectedKeyList.length === 0 ||
      budgetInvalid(maxCalls) ||
      budgetInvalid(maxCostUsd)
    : budgetsInvalid || delayInvalid;

  const toggleLoop = (checked: boolean) => {
    setLoop(checked);
    if (checked && provider !== "gemini") {
      setProvider("gemini");
      setModel("");
      setCallDelayMs(GEMINI_DEFAULT_DELAY_MS);
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
          jobId: JOB_IDS[variant],
          params: loop
            ? {
                provider: "gemini",
                loop: true,
                keys: selectedKeyList,
                ...(model ? { model } : {}),
                callDelayMs: callDelayMs === "" ? GEMINI_DEFAULT_DELAY_MS : callDelayMs,
                ...(maxCalls !== "" ? { maxCalls } : {}),
                ...(maxCostUsd !== "" ? { maxCostUsd } : {}),
              }
            : { provider, ...(model ? { model } : {}), maxCalls, maxCostUsd, callDelayMs },
        },
      });
      setRunNote("Started. Watch progress on the Jobs page.");
      onStarted?.();
      loadProgress();
      wasRunning.current = true;
      setJobRunning(true);
      // A failed status check pauses polling; a successful start must retry it.
      if (statusError) void refreshRunning();
    } catch (e) {
      setRunError(e instanceof AdminApiError ? e.message : "Failed to start the verification job.");
    } finally {
      setStarting(false);
    }
  };

  return (
    <Panel>
      <SectionHeading
        title={
          variant === "translations"
            ? "Re-check existing translations"
            : "Re-verify existing connections"
        }
      />
      <p className="mt-1 text-xs text-text-muted">
        {variant === "translations" ? (
          <>
            Runs every active Turkish, Russian and Azerbaijani connection that has not been checked
            yet through the back-translation check (two LLM calls each: translate it back to
            English, then compare with the English reason) and flags any whose meaning drifted.
            Flagged translations are hidden, so users see the English reason instead, and wait in
            the{" "}
          </>
        ) : (
          <>
            Runs every active English connection that has not been verified yet through the verifier
            and flags any it does not explicitly approve, in every language. Flagged connections are
            hidden from users straight away and wait in the{" "}
          </>
        )}
        <Link href="/admin/connections" className="underline">
          review queue
        </Link>{" "}
        where a false positive can be restored. Resumable: a checked item is never re-checked, and a
        run that stops (budget, quota, Stop) continues where it left off the next time.
      </p>

      {statusError && (
        <StateNote tone="error">
          Could not check whether the job is running, so live updates are paused. Use Refresh.
        </StateNote>
      )}
      {variant === "translations" ? (
        <TranslationProgressBlock
          progress={progress as TranslationProgress | null}
          error={progressError}
          onRefresh={refreshAll}
        />
      ) : (
        <ProgressBlock
          progress={progress as VerificationProgress | null}
          error={progressError}
          onRefresh={refreshAll}
        />
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Provider">
          <NativeSelect
            value={loop ? "gemini" : provider}
            disabled={loop}
            onChange={(e) => {
              const next = e.target.value as "claude" | "gemini";
              setProvider(next);
              setModel("");
              setCallDelayMs(next === "gemini" ? GEMINI_DEFAULT_DELAY_MS : 0);
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

        <Field
          label="Delay between LLM calls (ms)"
          hint="One call verifies one cell. A higher delay lowers the risk of per-minute rate limits."
        >
          <Input
            type="number"
            min={0}
            max={MAX_CALL_DELAY_MS}
            step={100}
            value={callDelayMs}
            onChange={(e) => setCallDelayMs(e.target.value === "" ? "" : Number(e.target.value))}
            className="tabular-nums"
          />
        </Field>
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
              Loop: keep running, rotating Gemini keys, until everything is verified or every
              selected key hits its daily quota
            </span>
            <span className="mt-0.5 block text-text-muted">
              Gemini-only (free tier). Only a per-day quota rotates to the next key. The job log
              says ALL DONE when nothing is left to verify. Stop a run from the{" "}
              <Link href="/admin/jobs" className="underline">
                Jobs page
              </Link>
              .
            </span>
          </span>
        </label>

        {loop && (
          <div className="mt-3 text-xs">
            <span className="mb-1 block text-text-secondary">Gemini keys (rotation order)</span>
            {geminiKeys === null ? (
              <span className="text-text-muted">Loading…</span>
            ) : keysError ? (
              <span className="text-text-muted">
                Couldn&apos;t load the key list. Reload the page to retry.
              </span>
            ) : geminiKeys.length === 0 ? (
              <span className="text-text-muted">
                No GEMINI_API1..5 keys configured. Set them in the environment to use loop mode.
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
        )}
      </div>

      <p className="mt-2 text-[11px] text-text-muted">
        {loop
          ? "In loop mode both budget fields are optional safety caps. Leave them blank to run until everything is verified, the keys are exhausted, or you click Stop. "
          : null}
        Max LLM calls and Max cost are both required. The job stops cleanly at whichever limit is
        hit first. When a Gemini key hits its daily quota the run ends; start it again later or with
        another key to continue. Stop a run in progress from the{" "}
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

      {formInvalid && (
        <p className="mt-2 text-[11px] text-text-muted">
          {loop
            ? "Select at least one Gemini key and a valid delay to enable the run."
            : "Enter Max LLM calls, Max cost and a valid delay to enable the run."}
        </p>
      )}

      <div className="mt-3">
        <ConfirmButton
          variant="secondary"
          disabled={starting || formInvalid}
          onConfirm={startRun}
          confirmLabel={
            loop
              ? `Loop verification on ${selectedKeyList.length} key(s)?`
              : `Verify on ${provider}?`
          }
        >
          {starting ? "Starting…" : loop ? "Start loop" : "Run verification"}
        </ConfirmButton>
      </div>
    </Panel>
  );
}
