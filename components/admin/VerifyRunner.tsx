"use client";

import { useState } from "react";
import Link from "next/link";
import { Input, NativeSelect } from "@/components/ui";
import { StateNote, ConfirmButton, Panel } from "@/components/admin/primitives";
import { Field } from "@/components/admin/Field";
import { SectionHeading } from "@/components/admin/SectionHeading";
import { useAdminFetch, AdminApiError } from "@/components/admin/AdminContext";
import { SELECTABLE_MODELS } from "@/lib/ai/models";

const GEMINI_DEFAULT_DELAY_MS = 1500;
const MAX_CALL_DELAY_MS = 60_000;

/**
 * The "Re-verify existing connections" console. Runs every active English
 * connection that has not been verified yet through the same verifier new
 * connections pass at generation, and flags the ones it does not approve (in
 * every language) for the review queue. Like the backfill form, both budgets
 * are required and have no default, so a stray click can never start a run that
 * spends money; progress and Stop live on the Jobs page.
 */
export function VerifyRunner({ onStarted }: { onStarted?: () => void }) {
  const api = useAdminFetch();
  const [provider, setProvider] = useState<"claude" | "gemini">("gemini");
  const [model, setModel] = useState("");
  const [maxCalls, setMaxCalls] = useState<number | "">("");
  const [maxCostUsd, setMaxCostUsd] = useState<number | "">("");
  const [callDelayMs, setCallDelayMs] = useState<number | "">(GEMINI_DEFAULT_DELAY_MS);

  const [runNote, setRunNote] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const delayInvalid =
    callDelayMs === "" ||
    !Number.isInteger(callDelayMs) ||
    callDelayMs < 0 ||
    callDelayMs > MAX_CALL_DELAY_MS;
  const budgetsInvalid = maxCalls === "" || maxCostUsd === "" || maxCalls <= 0 || maxCostUsd <= 0;
  const formInvalid = budgetsInvalid || delayInvalid;

  const startRun = async () => {
    setRunNote(null);
    setRunError(null);
    if (formInvalid) return;
    setStarting(true);
    try {
      await api("/jobs", {
        method: "POST",
        json: {
          jobId: "verify-connections",
          params: { provider, ...(model ? { model } : {}), maxCalls, maxCostUsd, callDelayMs },
        },
      });
      setRunNote("Started. Watch progress on the Jobs page.");
      onStarted?.();
    } catch (e) {
      setRunError(e instanceof AdminApiError ? e.message : "Failed to start the verification job.");
    } finally {
      setStarting(false);
    }
  };

  return (
    <Panel>
      <SectionHeading title="Re-verify existing connections" />
      <p className="mt-1 text-xs text-text-muted">
        Runs every active English connection that has not been verified yet through the verifier and
        flags any it does not explicitly approve, in every language. Flagged connections are hidden
        from users straight away and wait in the{" "}
        <Link href="/admin/connections" className="underline">
          review queue
        </Link>{" "}
        where a false positive can be restored. Resumable: a verified cell is never re-checked, and
        a run that stops (budget, quota, Stop) continues where it left off the next time.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Provider">
          <NativeSelect
            value={provider}
            onChange={(e) => {
              const next = e.target.value as "claude" | "gemini";
              setProvider(next);
              setModel("");
              setCallDelayMs(next === "gemini" ? GEMINI_DEFAULT_DELAY_MS : 0);
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

      <p className="mt-2 text-[11px] text-text-muted">
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
          Enter Max LLM calls, Max cost and a valid delay to enable the run.
        </p>
      )}

      <div className="mt-3">
        <ConfirmButton
          variant="secondary"
          disabled={starting || formInvalid}
          onConfirm={startRun}
          confirmLabel={`Verify on ${provider}?`}
        >
          {starting ? "Starting…" : "Run verification"}
        </ConfirmButton>
      </div>
    </Panel>
  );
}
