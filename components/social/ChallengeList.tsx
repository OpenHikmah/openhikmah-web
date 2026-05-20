"use client";

import { useState, useEffect } from "react";
import { useAuthStore } from "@/store/auth";
import { useSocialStore } from "@/store/social";
import { Loader2, Trophy, Clock } from "lucide-react";

export interface EnrichedChallenge {
  id: number;
  challengerId: number;
  challengedId: number;
  challengerUsername: string | null;
  challengedUsername: string | null;
  verseRef: string | null;
  status: string;
  startsAt: string;
  endsAt: string;
  winnerId: number | null;
  challengerScore: number;
  challengedScore: number;
}

interface Props {
  challenges: EnrichedChallenge[];
  onUpdate: () => void;
}

function formatCountdown(endsAt: string): string {
  const diff = new Date(endsAt).getTime() - Date.now();
  if (diff <= 0) return "Ended";
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h left`;
  return `${h}h ${m}m left`;
}

function useCountdown(endsAt: string): string {
  const [label, setLabel] = useState(() => formatCountdown(endsAt));

  useEffect(() => {
    if (new Date(endsAt).getTime() <= Date.now()) return;
    const id = setInterval(() => {
      const next = formatCountdown(endsAt);
      setLabel(next);
      if (next === "Ended") clearInterval(id);
    }, 60_000);
    return () => clearInterval(id);
  }, [endsAt]);

  return label;
}

function ChallengeCard({
  c,
  myId,
  onUpdate,
}: {
  c: EnrichedChallenge;
  myId: number;
  onUpdate: () => void;
}) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [acting, setActing] = useState<"accept" | "decline" | null>(null);
  const countdown = useCountdown(c.endsAt);
  const isChallenger = c.challengerId === myId;
  const myScore = isChallenger ? c.challengerScore : c.challengedScore;
  const theirScore = isChallenger ? c.challengedScore : c.challengerScore;
  const opponentName = isChallenger ? c.challengedUsername : c.challengerUsername;
  const iWon = c.winnerId === myId;
  const theyWon = c.winnerId !== null && c.winnerId !== myId;

  const handleAction = async (action: "accept" | "decline") => {
    if (!accessToken) return;
    setActing(action);
    try {
      await fetch(`/api/social/challenges/${c.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ action }),
      });
      onUpdate();
    } finally {
      setActing(null);
    }
  };

  const borderColor =
    c.status === "completed" && iWon
      ? "var(--color-gold)"
      : c.status === "active"
      ? "var(--color-teal)"
      : "var(--color-border)";

  return (
    <div
      className="rounded border p-3 space-y-2 text-sm"
      style={{
        borderColor,
        background: "var(--color-surface)",
        opacity: c.status === "declined" ? 0.5 : 1,
      }}
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium" style={{ color: "var(--color-text-primary)" }}>
          vs @{opponentName}
        </span>
        <span
          className="text-xs font-mono px-1.5 py-0.5 rounded"
          style={{
            background: "var(--color-surface-overlay)",
            color:
              c.status === "active" ? "var(--color-teal)" :
              c.status === "completed" && iWon ? "var(--color-gold)" :
              "var(--color-text-muted)",
          }}
        >
          {c.status === "active" ? "Active" :
           c.status === "pending" && !isChallenger ? "Incoming" :
           c.status === "pending" ? "Pending" :
           c.status === "completed" && iWon ? "Won" :
           c.status === "completed" && theyWon ? "Lost" :
           c.status === "completed" ? "Draw" :
           "Declined"}
        </span>
      </div>

      {/* Verse context */}
      {c.verseRef && (
        <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
          Verse: {c.verseRef}
        </p>
      )}

      {/* Scores (active / completed) */}
      {(c.status === "active" || c.status === "completed") && (
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono" style={{ color: "var(--color-text-secondary)" }}>
            You {myScore} — {theirScore} @{opponentName}
          </span>
          {c.status === "active" && (
            <span className="flex items-center gap-1 text-xs" style={{ color: "var(--color-text-muted)" }}>
              <Clock className="w-3 h-3" />
              {countdown}
            </span>
          )}
          {c.status === "completed" && iWon && (
            <Trophy className="w-3.5 h-3.5" style={{ color: "var(--color-gold)" }} />
          )}
        </div>
      )}

      {/* Pending sent */}
      {c.status === "pending" && isChallenger && (
        <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
          Waiting for @{opponentName} to respond…
        </p>
      )}

      {/* Pending received — accept / decline */}
      {c.status === "pending" && !isChallenger && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleAction("accept")}
            disabled={acting !== null}
            className="flex items-center gap-1 px-2.5 py-1 rounded border text-xs font-medium transition-colors disabled:opacity-50 cursor-pointer"
            style={{ borderColor: "var(--color-teal)", color: "var(--color-teal)" }}
          >
            {acting === "accept" ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
            Accept
          </button>
          <button
            onClick={() => handleAction("decline")}
            disabled={acting !== null}
            className="flex items-center gap-1 px-2.5 py-1 rounded border text-xs transition-colors disabled:opacity-50 cursor-pointer"
            style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
          >
            {acting === "decline" ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
            Decline
          </button>
        </div>
      )}
    </div>
  );
}

export function ChallengeList({ challenges, onUpdate }: Props) {
  const myId = useSocialStore((s) => s.userId);

  if (!myId) return null;

  if (challenges.length === 0) {
    return (
      <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
        No challenges yet. Send one to a friend!
      </p>
    );
  }

  const order = ["active", "pending", "completed", "declined"];
  const sorted = [...challenges].sort(
    (a, b) => order.indexOf(a.status) - order.indexOf(b.status)
  );

  return (
    <div className="space-y-2">
      {sorted.map((c) => (
        <ChallengeCard key={c.id} c={c} myId={myId} onUpdate={onUpdate} />
      ))}
    </div>
  );
}
