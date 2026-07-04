"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import {
  Table,
  Th,
  Td,
  Pill,
  StateNote,
  ConfirmButton,
  StatTile,
} from "@/components/admin/primitives";
import { useAdminFetch, AdminApiError } from "@/components/admin/AdminContext";
import { useAsync } from "@/components/admin/useAsync";
import { cn } from "@/lib/utils";

interface AdminChallenge {
  id: number;
  challengerId: number;
  challengedId: number;
  challengerUsername: string | null;
  challengedUsername: string | null;
  status: "pending" | "active" | "completed" | "declined" | "cancelled";
  verseRef: string | null;
  endsAt: string;
  winnerId: number | null;
  suggestionId: number | null;
  challengerScore: number;
  challengedScore: number;
}

interface Stats {
  byStatus: Record<string, number>;
  total: number;
  fromSuggestions: number;
}

const FILTERS = ["all", "pending", "active", "completed", "declined", "cancelled"] as const;

const statusTone = (s: AdminChallenge["status"]) =>
  s === "active"
    ? "active"
    : s === "pending"
      ? "flagged"
      : s === "completed"
        ? "neutral"
        : "retired";

export function ChallengesModeration() {
  const api = useAdminFetch();
  const [status, setStatus] = useState<(typeof FILTERS)[number]>("all");
  const [actionError, setActionError] = useState<string | null>(null);
  const [finalizeMsg, setFinalizeMsg] = useState<string | null>(null);

  const { data, error, loading, reload } = useAsync<{ stats: Stats; challenges: AdminChallenge[] }>(
    () => api(`/challenges${status === "all" ? "" : `?status=${status}`}`),
    `admin-challenges:${status}`
  );

  const act = async (fn: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await fn();
      reload();
    } catch (e) {
      setActionError(e instanceof AdminApiError ? e.message : "Action failed.");
    }
  };

  const finalize = async () => {
    setFinalizeMsg(null);
    setActionError(null);
    try {
      const res = await api<{ resolved: number }>("/challenges/finalize", { method: "POST" });
      setFinalizeMsg(`Finalized ${res.resolved} ended challenge${res.resolved === 1 ? "" : "s"}.`);
      reload();
    } catch (e) {
      setActionError(e instanceof AdminApiError ? e.message : "Finalize failed.");
    }
  };

  return (
    <div className="space-y-4">
      {data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          <StatTile
            label="Total"
            value={data.stats.total}
            tone="plain"
            info="All 1v1 challenges ever created, across every status."
          />
          <StatTile
            label="Active"
            value={data.stats.byStatus.active ?? 0}
            tone="teal"
            info="Challenges that have been accepted and are currently being competed (within their time window)."
          />
          <StatTile
            label="Pending"
            value={data.stats.byStatus.pending ?? 0}
            info="Challenges sent but not yet accepted or declined by the recipient."
          />
          <StatTile
            label="Completed"
            value={data.stats.byStatus.completed ?? 0}
            tone="plain"
            info="Challenges whose window has ended and a winner (or draw) has been resolved."
          />
          <StatTile
            label="Declined"
            value={data.stats.byStatus.declined ?? 0}
            tone="plain"
            info="Challenges the recipient declined. (Withdrawn ones show as 'cancelled'.)"
          />
          <StatTile
            label="From suggestions"
            value={data.stats.fromSuggestions}
            tone="teal"
            info="How many challenges were started from an admin-curated suggestion, rather than created from scratch."
          />
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setStatus(f)}
              className={cn(
                "rounded border px-2 py-1 text-xs capitalize transition-colors",
                status === f
                  ? "border-gold-muted bg-gold/10 text-gold"
                  : "border-border text-text-secondary hover:border-gold-muted"
              )}
            >
              {f}
            </button>
          ))}
        </div>
        <ConfirmButton variant="secondary" onConfirm={finalize} confirmLabel="Finalize ended?">
          Finalize ended
        </ConfirmButton>
      </div>

      {finalizeMsg && <StateNote>{finalizeMsg}</StateNote>}
      {error && <StateNote tone="error">{error}</StateNote>}
      {actionError && <StateNote tone="error">{actionError}</StateNote>}
      {loading && <StateNote>Loading…</StateNote>}
      {data && data.challenges.length === 0 && <StateNote>No challenges match.</StateNote>}

      {data && data.challenges.length > 0 && (
        <Table>
          <thead>
            <tr>
              <Th>Match</Th>
              <Th>Status</Th>
              <Th>Score</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {data.challenges.map((c) => {
              const a = c.challengerUsername ?? `#${c.challengerId}`;
              const b = c.challengedUsername ?? `#${c.challengedId}`;
              const winLabel =
                c.winnerId === null
                  ? c.status === "completed"
                    ? "draw"
                    : "—"
                  : c.winnerId === c.challengerId
                    ? a
                    : b;
              return (
                <tr key={c.id}>
                  <Td>
                    <div className="text-sm text-text-primary">
                      @{a} <span className="text-text-muted">vs</span> @{b}
                    </div>
                    {c.suggestionId && <div className="text-[10px] text-teal">from suggestion</div>}
                  </Td>
                  <Td>
                    <Pill tone={statusTone(c.status)}>{c.status}</Pill>
                    {c.status === "completed" && (
                      <span className="ml-1.5 text-xs text-text-muted">won: {winLabel}</span>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap font-mono text-xs text-text-secondary tabular-nums">
                    {c.challengerScore} — {c.challengedScore}
                  </Td>
                  <Td>
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      {c.status === "active" && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            act(() =>
                              api(`/challenges/${c.id}`, {
                                method: "PATCH",
                                json: { action: "end" },
                              })
                            )
                          }
                        >
                          End now
                        </Button>
                      )}
                      {(c.status === "active" || c.status === "completed") && (
                        <span className="flex items-center gap-1 rounded border border-border px-1.5 py-0.5">
                          <span className="font-mono text-[10px] uppercase text-text-muted">
                            win
                          </span>
                          <OverrideButton
                            label={`@${a}`}
                            onClick={() =>
                              act(() =>
                                api(`/challenges/${c.id}`, {
                                  method: "PATCH",
                                  json: { action: "override-winner", winnerId: c.challengerId },
                                })
                              )
                            }
                          />
                          <OverrideButton
                            label="draw"
                            onClick={() =>
                              act(() =>
                                api(`/challenges/${c.id}`, {
                                  method: "PATCH",
                                  json: { action: "override-winner", winnerId: null },
                                })
                              )
                            }
                          />
                          <OverrideButton
                            label={`@${b}`}
                            onClick={() =>
                              act(() =>
                                api(`/challenges/${c.id}`, {
                                  method: "PATCH",
                                  json: { action: "override-winner", winnerId: c.challengedId },
                                })
                              )
                            }
                          />
                        </span>
                      )}
                      <ConfirmButton
                        onConfirm={() =>
                          act(() => api(`/challenges/${c.id}`, { method: "DELETE" }))
                        }
                        confirmLabel="Void?"
                      >
                        Void
                      </ConfirmButton>
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </div>
  );
}

function OverrideButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded px-1 text-[11px] text-text-secondary transition-colors hover:text-gold"
    >
      {label}
    </button>
  );
}
