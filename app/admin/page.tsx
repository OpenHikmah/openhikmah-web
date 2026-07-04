"use client";

import { AdminPageHeader } from "@/components/admin/AdminShell";
import { StatTile, StateNote, Pill } from "@/components/admin/primitives";
import { InfoHint } from "@/components/admin/InfoHint";
import { useAdminFetch } from "@/components/admin/AdminContext";
import { useAsync } from "@/components/admin/useAsync";

interface Overview {
  users: { total: number; disabled: number };
  connections: { total: number; flagged: number };
  votd: { total: number; upcoming: number };
  aiMonthToDate: { generations: number; tokens: number };
  redis: "disabled" | "up" | "down";
}

export default function OverviewPage() {
  const api = useAdminFetch();
  const { data, error, loading } = useAsync<Overview>(() => api("/overview"), "overview");

  return (
    <>
      <AdminPageHeader title="Overview" subtitle="A snapshot of the project right now." />
      <div className="p-7">
        {loading && <StateNote>Loading…</StateNote>}
        {error && <StateNote tone="error">{error}</StateNote>}
        {data && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <StatTile
              label="Users"
              value={data.users.total}
              hint={`${data.users.disabled} disabled`}
              info="Total registered accounts. 'disabled' counts accounts an admin has soft-disabled (they can't sign in)."
            />
            <StatTile
              label="Flagged edges"
              value={data.connections.flagged}
              hint={`of ${data.connections.total} total`}
              tone={data.connections.flagged > 0 ? "gold" : "plain"}
              info="AI-generated connections between verses that have been flagged for review (vs. the total in the graph). Moderate them under Connections."
            />
            <StatTile
              label="Curated days"
              value={data.votd.total}
              hint={`${data.votd.upcoming} upcoming`}
              tone="teal"
              info="Days you've hand-picked a Verse of the Day override (instead of the algorithmic pick). 'upcoming' are still in the future."
            />
            <StatTile
              label="AI gens (MTD)"
              value={data.aiMonthToDate.generations}
              hint={`${data.aiMonthToDate.tokens.toLocaleString()} tokens`}
              info="AI generations (and tokens) this calendar month so far — one per cache miss. The bill flattens as the graph fills."
            />
            <div className="rounded-lg border border-border bg-surface px-4 py-3.5">
              <div className="flex items-start justify-between gap-2">
                <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted">
                  Redis
                </div>
                <InfoHint text="Optional cache/accelerator. 'up' = connected, 'down' = configured but unreachable, 'disabled' = not configured (the app falls back to in-process/Postgres)." />
              </div>
              <div className="mt-2">
                <Pill
                  tone={
                    data.redis === "up" ? "active" : data.redis === "down" ? "flagged" : "neutral"
                  }
                >
                  {data.redis}
                </Pill>
              </div>
            </div>
          </div>
        )}

        {/* Tiny deploy-config reminder (always visible). */}
        <p className="mt-8 border-t border-border-subtle pt-3 text-[11px] leading-relaxed text-text-muted">
          Deploy note: set <code className="text-text-secondary">ADMIN_QF_IDS</code> in the env (see{" "}
          <code className="text-text-secondary">.env.example</code>) — without it the panel is
          locked to everyone. Optional{" "}
          <code className="text-text-secondary">AI_USD_PER_1K_TOKENS</code> enables the cost
          estimate. Migration <code className="text-text-secondary">0010</code> runs via{" "}
          <code className="text-text-secondary">scripts/migrate.mjs</code> on deploy.
        </p>
      </div>
    </>
  );
}
