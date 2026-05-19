"use client";

import { useEffect } from "react";
import { useSocialStore } from "@/store/social";
import { useAuthStore } from "@/store/auth";
import { Flame } from "lucide-react";

export function StreakBadge() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const userId = useSocialStore((s) => s.userId);
  const streak = useSocialStore((s) => s.streak);
  const { bumpStreak } = useSocialStore();

  // Hydrate streak from server on first render after sign-in
  useEffect(() => {
    if (!accessToken || !userId) return;
    fetch("/api/social/activity", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.streak !== undefined) {
          bumpStreak(data.streak, data.longestStreak);
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, userId]);

  if (!accessToken || !userId) return null;

  return (
    <div
      className="flex items-center gap-1 px-2 py-1 rounded border text-xs"
      style={{
        borderColor: streak > 0 ? "var(--color-gold)" : "var(--color-border)",
        color: streak > 0 ? "var(--color-gold)" : "var(--color-text-muted)",
        background: streak > 0 ? "rgba(201,168,76,0.08)" : "transparent",
      }}
      title={`${streak}-day streak`}
    >
      <Flame className="w-3 h-3" fill={streak > 0 ? "currentColor" : "none"} />
      <span className="font-mono">{streak}</span>
    </div>
  );
}
