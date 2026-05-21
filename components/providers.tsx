"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { MiniPlayer } from "@/components/audio/MiniPlayer";
import { useAuthStore } from "@/store/auth";
import { useSocialStore } from "@/store/social";

function SessionRestorer() {
  const setTokens = useAuthStore((s) => s.setTokens);
  const setSessionLoaded = useAuthStore((s) => s.setSessionLoaded);
  const loadRemoteBookmarks = useAuthStore((s) => s.loadRemoteBookmarks);
  const setProfile = useSocialStore((s) => s.setProfile);
  const bumpStreak = useSocialStore((s) => s.bumpStreak);
  const didRun = useRef(false);

  useEffect(() => {
    if (didRun.current) return;
    didRun.current = true;

    fetch("/api/auth/refresh", { method: "POST" })
      .then(async (res) => {
        if (!res.ok) return;
        const { accessToken } = await res.json() as { accessToken?: string };
        if (!accessToken) return;
        setTokens(accessToken);

        const [profileRes] = await Promise.all([
          fetch("/api/social/me", { headers: { Authorization: `Bearer ${accessToken}` } }),
          loadRemoteBookmarks(),
        ]);

        if (profileRes.ok) {
          const p = await profileRes.json() as { id?: number; username?: string; currentStreak?: number; longestStreak?: number };
          if (p.id && p.username) {
            setProfile({ userId: p.id, username: p.username });
            if (p.currentStreak !== undefined) bumpStreak(p.currentStreak, p.longestStreak);
          }
        }
      })
      .catch(() => {})
      .finally(() => setSessionLoaded());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            retry: 1,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <SessionRestorer />
      {children}
      <MiniPlayer />
    </QueryClientProvider>
  );
}
