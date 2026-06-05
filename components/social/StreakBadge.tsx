"use client";

import { useEffect } from "react";
import { useSocialStore } from "@/store/social";
import { useAuthStore } from "@/store/auth";
import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";

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
      className={cn(
        "flex items-center gap-1 rounded border px-2 py-1 text-xs",
        streak > 0 ? "border-gold bg-gold/[0.08] text-gold" : "border-border text-text-muted"
      )}
      title={`${streak}-day streak`}
    >
      <Flame className="w-3 h-3" fill={streak > 0 ? "currentColor" : "none"} />
      <span className="font-mono">{streak}</span>
    </div>
  );
}
