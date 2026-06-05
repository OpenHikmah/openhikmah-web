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
    return <p className="py-4 text-sm text-text-muted">Add friends to see the leaderboard.</p>;
  }

  return (
    <div className="space-y-1">
      {entries.map((entry) => (
        <div
          key={entry.id}
          className={cn(
            "flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors",
            entry.isYou ? "border-teal bg-teal/[0.06]" : "border-border bg-surface-raised"
          )}
        >
          {/* Rank */}
          <div className="w-6 text-center">
            {entry.rank === 1 ? (
              <Crown className="mx-auto h-4 w-4 text-gold" />
            ) : (
              <span className="font-mono text-xs text-text-muted">{entry.rank}</span>
            )}
          </div>

          {/* Name */}
          <div className="min-w-0 flex-1">
            <span
              className={cn(
                "truncate text-sm",
                entry.isYou ? "font-medium text-teal" : "text-text-primary"
              )}
            >
              {entry.displayName ?? entry.username}
            </span>
            {entry.displayName && (
              <span className="ml-1.5 font-mono text-xs text-text-muted">@{entry.username}</span>
            )}
            {entry.isYou && <span className="ml-1.5 text-xs text-text-muted">(you)</span>}
          </div>

          {/* Streak */}
          <div className="flex shrink-0 items-center gap-1">
            <Flame
              className={cn("h-3.5 w-3.5", entry.streak > 0 ? "text-gold" : "text-text-muted")}
              fill={entry.streak > 0 ? "currentColor" : "none"}
            />
            <span
              className={cn(
                "font-mono text-sm font-medium",
                entry.streak > 0 ? "text-gold" : "text-text-muted"
              )}
            >
              {entry.streak}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
