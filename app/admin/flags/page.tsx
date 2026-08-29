"use client";

import { useRef, useState } from "react";
import { Button, Input, Textarea, NativeSelect } from "@/components/ui";
import { AdminPageHeader } from "@/components/admin/AdminShell";
import { Table, Th, Td, StateNote, ConfirmButton, Panel } from "@/components/admin/primitives";
import { Field } from "@/components/admin/Field";
import { Feedback } from "@/components/admin/Feedback";
import { useAdminFetch, AdminApiError } from "@/components/admin/AdminContext";
import { useAsync } from "@/components/admin/useAsync";
import { KNOWN_OPERATIONAL_FLAG_KEYS } from "@/lib/admin/feature-flag-keys";
import { SELECTABLE_MODELS } from "@/lib/ai/models";

const AI_ROUTES = [
  { key: "", label: "Default" },
  { key: "_connections", label: "Connections" },
  { key: "_names", label: "Names (Asma-ul-Husna)" },
] as const;

interface Flag {
  key: string;
  value: unknown;
  updatedBy: string | null;
  updatedAt: string;
}

type Provider = "claude" | "gemini";
interface ResolvedRoute {
  provider: Provider;
  model: string;
}
interface FlagsResponse {
  flags: Flag[];
  resolvedAi: { default: ResolvedRoute; connections: ResolvedRoute; names: ResolvedRoute };
}

/** Purpose-built controls for the settings that runtime code actually reads —
 *  everything else stays in the generic key/value editor below. Each control
 *  writes through the same `PUT /flags` route as the generic editor, so
 *  logAdminAction coverage and cache invalidation are free. */
function OperationalSettings({
  flags,
  resolvedAi,
  reload,
}: {
  flags: Flag[];
  resolvedAi: FlagsResponse["resolvedAi"];
  reload: () => void;
}) {
  const api = useAdminFetch();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const byKey = new Map(flags.map((f) => [f.key, f.value]));
  const strFlag = (key: string): string => {
    const v = byKey.get(key);
    return typeof v === "string" ? v : "";
  };
  const maintenanceOn = byKey.get("maintenance_mode") === true;

  // What each route actually resolves to server-side (flags AND env, via
  // resolveProvider/resolveModel), reported by GET /flags — the client can't
  // read env itself. Drives which model list to offer + the "default" hint.
  const routeFor = (routeKey: string): ResolvedRoute =>
    routeKey === "_connections"
      ? resolvedAi.connections
      : routeKey === "_names"
        ? resolvedAi.names
        : resolvedAi.default;

  // Uncontrolled: each number field reads its live DOM value on save and is
  // reset (via `key`) whenever the flag list is reloaded from the server.
  const aiGenLimitRef = useRef<HTMLInputElement>(null);
  const aiGenWindowRef = useRef<HTMLInputElement>(null);
  const mutationLimitRef = useRef<HTMLInputElement>(null);
  const mutationWindowRef = useRef<HTMLInputElement>(null);

  const setFlag = async (key: string, value: unknown) => {
    setMsg(null);
    setBusy(true);
    try {
      await api("/flags", { method: "PUT", json: { key, value } });
      reload();
    } catch (e) {
      setMsg(e instanceof AdminApiError ? e.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  };

  const setNumberFlag = (key: string, ref: React.RefObject<HTMLInputElement | null>) => {
    const raw = ref.current?.value ?? "";
    const n = Number(raw);
    if (!raw.trim() || !Number.isFinite(n) || n <= 0) {
      setMsg("Value must be a positive number.");
      return;
    }
    void setFlag(key, n);
  };

  return (
    <Panel className="space-y-4">
      <h2 className="text-sm font-medium text-text-primary">Operational settings</h2>

      <div className="space-y-2">
        <span className="text-xs text-text-secondary">
          AI routing (provider &amp; model per feature)
        </span>
        <div className="space-y-2 rounded-md border border-border p-3">
          {AI_ROUTES.map((route) => {
            const resolved = routeFor(route.key);
            const modelKey = `ai_model${route.key}`;
            // A stored model left over from a previous provider isn't in this
            // provider's option list — show it as "Default" so the control
            // reflects what resolveModel() actually uses at call time.
            const storedModel = strFlag(modelKey);
            const modelValue = SELECTABLE_MODELS[resolved.provider].includes(storedModel)
              ? storedModel
              : "";
            return (
              <div key={route.key} className="grid items-center gap-2 sm:grid-cols-[8rem_1fr_1fr]">
                <span className="text-xs text-text-secondary">{route.label}</span>
                <NativeSelect
                  aria-label={`${route.label} provider`}
                  value={strFlag(`ai_provider${route.key}`)}
                  onChange={(e) => setFlag(`ai_provider${route.key}`, e.target.value)}
                  disabled={busy}
                >
                  <option value="">
                    {route.key === ""
                      ? `Default — ${resolved.provider}`
                      : `Inherit — ${resolved.provider}`}
                  </option>
                  <option value="claude">Claude</option>
                  <option value="gemini">Gemini</option>
                </NativeSelect>
                <NativeSelect
                  aria-label={`${route.label} model`}
                  value={modelValue}
                  onChange={(e) => setFlag(modelKey, e.target.value)}
                  disabled={busy}
                >
                  <option value="">Default — {resolved.model}</option>
                  {SELECTABLE_MODELS[resolved.provider].map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-text-muted">
          A model that doesn&apos;t belong to the selected provider is ignored at call time and the
          provider default is used instead.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <span className="block text-xs text-text-secondary">Maintenance mode</span>
          <Button
            variant={maintenanceOn ? "primary" : "secondary"}
            disabled={busy}
            onClick={() => setFlag("maintenance_mode", !maintenanceOn)}
          >
            {maintenanceOn ? "On — click to disable" : "Off — click to enable"}
          </Button>
        </div>

        <Field label="AI generation limit (per window)">
          <div className="flex gap-2">
            <Input
              key={`ai_gen_limit:${numOrEmpty(byKey.get("ai_gen_limit"))}`}
              ref={aiGenLimitRef}
              defaultValue={numOrEmpty(byKey.get("ai_gen_limit"))}
              placeholder="20"
            />
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setNumberFlag("ai_gen_limit", aiGenLimitRef)}
            >
              Save
            </Button>
          </div>
        </Field>

        <Field label="AI generation window (seconds)">
          <div className="flex gap-2">
            <Input
              key={`ai_gen_window_seconds:${numOrEmpty(byKey.get("ai_gen_window_seconds"))}`}
              ref={aiGenWindowRef}
              defaultValue={numOrEmpty(byKey.get("ai_gen_window_seconds"))}
              placeholder="60"
            />
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setNumberFlag("ai_gen_window_seconds", aiGenWindowRef)}
            >
              Save
            </Button>
          </div>
        </Field>

        <Field label="Mutation limit (per window)">
          <div className="flex gap-2">
            <Input
              key={`mutation_limit:${numOrEmpty(byKey.get("mutation_limit"))}`}
              ref={mutationLimitRef}
              defaultValue={numOrEmpty(byKey.get("mutation_limit"))}
              placeholder="60"
            />
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setNumberFlag("mutation_limit", mutationLimitRef)}
            >
              Save
            </Button>
          </div>
        </Field>

        <Field label="Mutation window (seconds)">
          <div className="flex gap-2">
            <Input
              key={`mutation_window_seconds:${numOrEmpty(byKey.get("mutation_window_seconds"))}`}
              ref={mutationWindowRef}
              defaultValue={numOrEmpty(byKey.get("mutation_window_seconds"))}
              placeholder="600"
            />
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setNumberFlag("mutation_window_seconds", mutationWindowRef)}
            >
              Save
            </Button>
          </div>
        </Field>
      </div>

      {msg && <Feedback tone="error">{msg}</Feedback>}
    </Panel>
  );
}

function numOrEmpty(v: unknown): string {
  return typeof v === "number" ? String(v) : "";
}

export default function FlagsPage() {
  const api = useAdminFetch();
  const { data, error, loading, reload } = useAsync<FlagsResponse>(() => api("/flags"), "flags");

  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const save = async () => {
    setMsg(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      setMsg('Value must be valid JSON (e.g. true, 42, "text", {"a":1}).');
      return;
    }
    setSaving(true);
    try {
      await api("/flags", { method: "PUT", json: { key: key.trim(), value: parsed } });
      setKey("");
      setValue("");
      reload();
    } catch (e) {
      setMsg(e instanceof AdminApiError ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const edit = (f: Flag) => {
    setKey(f.key);
    setValue(JSON.stringify(f.value));
    setMsg(null);
  };

  const remove = async (k: string) => {
    setMsg(null);
    setBusyKey(k);
    try {
      await api(`/flags?key=${encodeURIComponent(k)}`, { method: "DELETE" });
      reload();
    } catch (e) {
      setMsg(e instanceof AdminApiError ? e.message : "Delete failed.");
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <>
      <AdminPageHeader
        title="Feature Flags"
        subtitle="Runtime config read by subsystems. A missing key falls back to its code default."
      />
      <div className="space-y-6 p-7">
        {data && (
          <OperationalSettings flags={data.flags} resolvedAi={data.resolvedAi} reload={reload} />
        )}

        <Panel className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
            <Field label="Key">
              <Input
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="rate_limit.window_s"
              />
            </Field>
            <Field label="Value (JSON)">
              <Textarea
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder='e.g. 60 or {"model":"x"}'
                rows={4}
                className="font-mono text-xs"
              />
            </Field>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              onClick={save}
              disabled={saving || !key.trim() || !value.trim()}
            >
              Save flag
            </Button>
            {msg && <Feedback tone="error">{msg}</Feedback>}
          </div>
        </Panel>

        {error && <StateNote tone="error">{error}</StateNote>}
        {loading && <StateNote>Loading…</StateNote>}
        {data && data.flags.length === 0 && <StateNote>No flags set.</StateNote>}

        {data && data.flags.length > 0 && (
          <Table>
            <thead>
              <tr>
                <Th>Key</Th>
                <Th>Value</Th>
                <Th>Updated</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {data.flags.map((f) => (
                <tr key={f.key}>
                  <Td className="font-mono text-xs text-gold">{f.key}</Td>
                  <Td className="max-w-xs font-mono text-xs text-text-secondary">
                    <span className="line-clamp-2 break-all">{JSON.stringify(f.value)}</span>
                  </Td>
                  <Td className="whitespace-nowrap text-xs text-text-muted">
                    {new Date(f.updatedAt).toLocaleDateString()}
                  </Td>
                  <Td>
                    <div className="flex justify-end gap-1.5">
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busyKey === f.key}
                        onClick={() => edit(f)}
                      >
                        Edit
                      </Button>
                      <ConfirmButton
                        disabled={busyKey === f.key}
                        onConfirm={() => remove(f.key)}
                        confirmLabel={
                          KNOWN_OPERATIONAL_FLAG_KEYS.has(f.key)
                            ? `Delete ${f.key}? Reverts to code default immediately.`
                            : "Delete?"
                        }
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
    </>
  );
}
