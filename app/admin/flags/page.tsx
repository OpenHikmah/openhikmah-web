"use client";

import { useRef, useState } from "react";
import { Button, Input } from "@/components/ui";
import { AdminPageHeader } from "@/components/admin/AdminShell";
import { Table, Th, Td, StateNote, ConfirmButton } from "@/components/admin/primitives";
import { useAdminFetch, AdminApiError } from "@/components/admin/AdminContext";
import { useAsync } from "@/components/admin/useAsync";

interface Flag {
  key: string;
  value: unknown;
  updatedBy: string | null;
  updatedAt: string;
}

/** Purpose-built controls for the settings that runtime code actually reads —
 *  everything else stays in the generic key/value editor below. Each control
 *  writes through the same `PUT /flags` route as the generic editor, so
 *  logAdminAction coverage and cache invalidation are free. */
function OperationalSettings({ flags, reload }: { flags: Flag[]; reload: () => void }) {
  const api = useAdminFetch();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const byKey = new Map(flags.map((f) => [f.key, f.value]));
  const aiProviderRaw = byKey.get("ai_provider");
  const aiProvider = typeof aiProviderRaw === "string" ? aiProviderRaw : "";
  const maintenanceOn = byKey.get("maintenance_mode") === true;

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
    <div className="space-y-4 rounded-lg border border-border bg-surface p-5">
      <h2 className="text-sm font-medium text-text-primary">Operational settings</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1.5">
          <span className="text-xs text-text-secondary">AI provider</span>
          <select
            value={aiProvider}
            onChange={(e) => setFlag("ai_provider", e.target.value)}
            disabled={busy}
            className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary hover:border-border-subtle focus:border-gold-muted"
          >
            <option value="">Default (env: AI_PROVIDER)</option>
            <option value="claude">Claude</option>
            <option value="gemini">Gemini</option>
          </select>
        </label>

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

        <label className="space-y-1.5">
          <span className="text-xs text-text-secondary">AI generation limit (per window)</span>
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
        </label>

        <label className="space-y-1.5">
          <span className="text-xs text-text-secondary">AI generation window (seconds)</span>
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
        </label>

        <label className="space-y-1.5">
          <span className="text-xs text-text-secondary">Mutation limit (per window)</span>
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
        </label>

        <label className="space-y-1.5">
          <span className="text-xs text-text-secondary">Mutation window (seconds)</span>
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
        </label>
      </div>

      {msg && <span className="text-xs text-error">{msg}</span>}
    </div>
  );
}

function numOrEmpty(v: unknown): string {
  return typeof v === "number" ? String(v) : "";
}

export default function FlagsPage() {
  const api = useAdminFetch();
  const { data, error, loading, reload } = useAsync<{ flags: Flag[] }>(
    () => api("/flags"),
    "flags"
  );

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
        {data && <OperationalSettings flags={data.flags} reload={reload} />}

        <div className="space-y-3 rounded-lg border border-border bg-surface p-5">
          <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
            <label className="space-y-1.5">
              <span className="text-xs text-text-secondary">Key</span>
              <Input
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="rate_limit.window_s"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs text-text-secondary">Value (JSON)</span>
              <Input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder='e.g. 60 or {"model":"x"}'
              />
            </label>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              onClick={save}
              disabled={saving || !key.trim() || !value.trim()}
            >
              Save flag
            </Button>
            {msg && <span className="text-xs text-error">{msg}</span>}
          </div>
        </div>

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
    </>
  );
}
