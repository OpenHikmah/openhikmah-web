"use client";

import { AdminPageHeader } from "@/components/admin/AdminShell";
import { StatTile, Table, Th, Td, StateNote } from "@/components/admin/primitives";
import { useAdminFetch } from "@/components/admin/AdminContext";
import { useAsync } from "@/components/admin/useAsync";

interface Agg {
  gens: number;
  tokens: number;
  estCostUsd: number | null;
}
interface AiData {
  total: Agg;
  monthToDate: Agg;
  byModel: { model: string; gens: number; tokens: number }[];
  byKind: { kind: string; gens: number; tokens: number }[];
  daily: { day: string; gens: number; tokens: number }[];
  pricePer1k: number | null;
}

function cost(c: number | null): string {
  return c === null ? "—" : `$${c.toFixed(2)}`;
}

export default function AiPage() {
  const api = useAdminFetch();
  const { data, error, loading } = useAsync<AiData>(() => api("/ai"), "ai");

  const maxTokens = Math.max(1, ...(data?.daily ?? []).map((d) => d.tokens));

  return (
    <>
      <AdminPageHeader
        title="AI & Cost"
        subtitle="Generation volume and token spend. One row per cache miss — the bill flattens as the graph fills."
      />
      <div className="space-y-6 p-7">
        {error && <StateNote tone="error">{error}</StateNote>}
        {loading && <StateNote>Loading…</StateNote>}

        {data && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile
                label="Gens (all time)"
                value={data.total.gens}
                info="Total AI generations ever — one row per actual model call (a cache miss). Cache hits don't count, so this grows slowly as the graph fills."
              />
              <StatTile
                label="Tokens (all time)"
                value={data.total.tokens.toLocaleString()}
                tone="plain"
                info="Total tokens consumed across all AI generations ever. Tokens are the real cost driver."
              />
              <StatTile
                label="Gens (MTD)"
                value={data.monthToDate.gens}
                tone="teal"
                info="AI generations so far this calendar month (UTC)."
              />
              <StatTile
                label="Est. cost (MTD)"
                value={cost(data.monthToDate.estCostUsd)}
                hint={
                  data.pricePer1k === null ? "set AI_USD_PER_1K_TOKENS" : `@ $${data.pricePer1k}/1k`
                }
                info="Estimated USD cost this month from token usage. Shows a figure only if AI_USD_PER_1K_TOKENS is set in the env; otherwise it's a dash."
              />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <section>
                <h2 className="mb-2 text-sm font-medium text-text-primary">By model</h2>
                <Table>
                  <thead>
                    <tr>
                      <Th>Model</Th>
                      <Th className="text-right">Gens</Th>
                      <Th className="text-right">Tokens</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byModel.map((r) => (
                      <tr key={r.model}>
                        <Td className="font-mono text-xs text-text-secondary">{r.model}</Td>
                        <Td className="text-right tabular-nums">{r.gens}</Td>
                        <Td className="text-right tabular-nums">{r.tokens.toLocaleString()}</Td>
                      </tr>
                    ))}
                    {data.byModel.length === 0 && (
                      <tr>
                        <Td className="text-text-muted">No generations yet.</Td>
                        <Td /> <Td />
                      </tr>
                    )}
                  </tbody>
                </Table>
              </section>

              <section>
                <h2 className="mb-2 text-sm font-medium text-text-primary">By kind</h2>
                <Table>
                  <thead>
                    <tr>
                      <Th>Kind</Th>
                      <Th className="text-right">Gens</Th>
                      <Th className="text-right">Tokens</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byKind.map((r) => (
                      <tr key={r.kind}>
                        <Td className="text-xs text-text-secondary">{r.kind}</Td>
                        <Td className="text-right tabular-nums">{r.gens}</Td>
                        <Td className="text-right tabular-nums">{r.tokens.toLocaleString()}</Td>
                      </tr>
                    ))}
                    {data.byKind.length === 0 && (
                      <tr>
                        <Td className="text-text-muted">No generations yet.</Td>
                        <Td /> <Td />
                      </tr>
                    )}
                  </tbody>
                </Table>
              </section>
            </div>

            <section>
              <h2 className="mb-2 text-sm font-medium text-text-primary">Last 30 days</h2>
              {data.daily.length === 0 ? (
                <StateNote>No activity in the last 30 days.</StateNote>
              ) : (
                <div className="space-y-1.5 rounded-lg border border-border bg-surface p-4">
                  {data.daily.map((d) => (
                    <div key={d.day} className="flex items-center gap-3">
                      <span className="w-20 shrink-0 font-mono text-[11px] text-text-muted">
                        {d.day}
                      </span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-bg">
                        <div
                          className="h-full rounded-full bg-teal"
                          style={{ width: `${(d.tokens / maxTokens) * 100}%` }}
                        />
                      </div>
                      <span className="w-16 shrink-0 text-right text-xs tabular-nums text-text-secondary">
                        {d.tokens.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </>
  );
}
