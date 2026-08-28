"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/store/auth";
import { useSocialStore } from "@/store/social";
import { postActivity } from "@/lib/social/post-activity";

/**
 * Credits a Story read toward the daily streak. Canvas verse/connection
 * additions are the only other activity source (see useActivityTracker) —
 * without this, a returning user who reads Stories instead of adding new
 * canvas nodes earns no activity that day and their streak silently stalls.
 */
export function StoryActivityTracker({ slug }: { slug: string }) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const applyActivityResult = useSocialStore((s) => s.applyActivityResult);

  useEffect(() => {
    if (!accessToken) return;
    void postActivity(accessToken, { type: "hadith_read" }).then((result) => {
      if (result) applyActivityResult(result);
    });
  }, [accessToken, slug, applyActivityResult]);

  return null;
}
