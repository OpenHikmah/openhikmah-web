"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/store/auth";
import { useSocialStore } from "@/store/social";

/**
 * Credits a Story read toward the daily streak. Canvas verse/connection
 * additions are the only other activity source (see useActivityTracker) —
 * without this, a returning user who reads Stories instead of adding new
 * canvas nodes earns no activity that day and their streak silently stalls.
 */
export function StoryActivityTracker({ slug }: { slug: string }) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const bumpStreak = useSocialStore((s) => s.bumpStreak);

  useEffect(() => {
    if (!accessToken) return;

    fetch("/api/social/activity", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ type: "hadith_read" }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.streak !== undefined) bumpStreak(data.streak, data.longestStreak);
      })
      .catch(() => {
        // Non-blocking — ignore errors, same as useActivityTracker.
      });
  }, [accessToken, slug, bumpStreak]);

  return null;
}
