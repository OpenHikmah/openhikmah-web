"use client";

import { Flame, Crown } from "lucide-react";
import { cn } from "@/lib/utils";

interface LeaderboardEntry {
  rank: number;
  id: number;
  username: string;
  displayName: string | null;
  streak: number;
  longestStreak: number;
  isYou: boolean;
}

interface Props {
  entries: LeaderboardEntry[];
}

export function LeaderboardTable({ entries }: Props) {
  if (entries.length === 0) {
    return (
      <p className="text-sm py-4" style={{ color: "var(--color-text-muted)" }}>
        Add friends to see the leaderboard.
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {entries.map((entry) => (
        <div
          key={entry.id}
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors",
            entry.isYou ? "border-[var(--color-teal)]" : "border-[var(--color-border)]"
          )}
          style={{
            background: entry.isYou
              ? "rgba(0,128,128,0.06)"
              : "var(--color-surface-raised)",
          }}
        >
          {/* Rank */}
          <div className="w-6 text-center">
            {entry.rank === 1 ? (
              <Crown className="w-4 h-4 mx-auto" style={{ color: "var(--color-gold)" }} />
            ) : (
              <span className="text-xs font-mono" style={{ color: "var(--color-text-muted)" }}>
                {entry.rank}
              </span>
            )}
          </div>

          {/* Name */}
          <div className="flex-1 min-w-0">
            <span
              className={cn("text-sm truncate", entry.isYou ? "font-medium" : "")}
              style={{
                color: entry.isYou
                  ? "var(--color-teal)"
                  : "var(--color-text-primary)",
              }}
            >
              {entry.displayName ?? entry.username}
            </span>
            {entry.displayName && (
              <span className="ml-1.5 text-xs font-mono" style={{ color: "var(--color-text-muted)" }}>
                @{entry.username}
              </span>
            )}
            {entry.isYou && (
              <span className="ml-1.5 text-xs" style={{ color: "var(--color-text-muted)" }}>
                (you)
              </span>
            )}
          </div>

          {/* Streak */}
          <div className="flex items-center gap-1 shrink-0">
            <Flame
              className="w-3.5 h-3.5"
              fill={entry.streak > 0 ? "currentColor" : "none"}
              style={{ color: entry.streak > 0 ? "var(--color-gold)" : "var(--color-text-muted)" }}
            />
            <span
              className="text-sm font-mono font-medium"
              style={{
                color: entry.streak > 0 ? "var(--color-gold)" : "var(--color-text-muted)",
              }}
            >
              {entry.streak}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
