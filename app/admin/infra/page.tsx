"use client";

import { useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminShell";
import { StatTile, Table, Th, Td, Pill, StateNote, ConfirmButton } from "@/components/admin/primitives";
import { useAdminFetch, AdminApiError } from "@/components/admin/AdminContext";
import { useAsync } from "@/components/admin/useAsync";

interface Infra {
  redis: "disabled" | "up" | "down";
  uptimeSeconds: number;
  tokenCacheSize: number;
  rateLimitRows: number;
  metrics: Record<string, number>;
}

function uptime(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function InfraPage() {
  const api = useAdminFetch();
  const { data, error, loading, reload } = useAsync<Infra>(() => api("/infra"), "infra");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (action: string) => {
    if (busy) return; // guard against concurrent maintenance operations
    setMsg(null);
    setBusy(true);
    try {
      const res = await api<Record<string, unknown>>("/infra", { method: "POST", json: { action } });
      setMsg(`Done: ${JSON.stringify(res)}`);
      reload();
    } catch (e) {
      setMsg(e instanceof AdminApiError ? e.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <AdminPageHeader title="Infra" subtitle="Process health, caches, and maintenance actions." />
      <div className="space-y-6 p-7">
        {error && <StateNote tone="error">{error}</StateNote>}
        {loading && <StateNote>Loading…</StateNote>}

        {data && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile label="Uptime" value={uptime(data.uptimeSeconds)} tone="plain" />
              <StatTile label="Token cache" value={data.tokenCacheSize} hint="in-process entries" />
              <StatTile label="Rate-limit rows" value={data.rateLimitRows} tone="plain" />
              <div className="rounded-lg border border-border bg-surface px-4 py-3.5">
                <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted">Redis</div>
                <div className="mt-2">
                  <Pill tone={data.redis === "up" ? "active" : data.redis === "down" ? "flagged" : "neutral"}>
                    {data.redis}
                  </Pill>
                </div>
              </div>
            </div>

            <section className="space-y-3 rounded-lg border border-border bg-surface p-5">
              <h2 className="text-sm font-medium text-text-primary">Maintenance</h2>
              <div className="flex flex-wrap gap-2">
                <ConfirmButton variant="secondary" disabled={busy} onConfirm={() => run("flush-tokens")} confirmLabel="Flush tokens?">
                  Flush token cache
                </ConfirmButton>
                <ConfirmButton variant="secondary" disabled={busy} onConfirm={() => run("flush-jwks")} confirmLabel="Flush JWKS?">
                  Flush JWKS cache
                </ConfirmButton>
                <ConfirmButton variant="danger" disabled={busy} onConfirm={() => run("reset-ratelimits")} confirmLabel="Reset limits?">
                  Reset rate limits
                </ConfirmButton>
              </div>
              {msg && <p className="text-xs text-text-secondary">{msg}</p>}
            </section>

            <section>
              <h2 className="mb-2 text-sm font-medium text-text-primary">Process metrics</h2>
              {Object.keys(data.metrics).length === 0 ? (
                <StateNote>No counters recorded yet.</StateNote>
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <Th>Counter</Th>
                      <Th className="text-right">Value</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(data.metrics).map(([k, v]) => (
                      <tr key={k}>
                        <Td className="font-mono text-xs text-text-secondary">{k}</Td>
                        <Td className="text-right tabular-nums">{v.toLocaleString()}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </section>
          </>
        )}
      </div>
    </>
  );
}
