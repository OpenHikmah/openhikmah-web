"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { MiniPlayer } from "@/components/audio/MiniPlayer";
import { TooltipProvider } from "@/components/ui";
import { useAuthStore } from "@/store/auth";
import { useSocialStore } from "@/store/social";

function SessionRestorer() {
  const setTokens = useAuthStore((s) => s.setTokens);
  const setSessionLoaded = useAuthStore((s) => s.setSessionLoaded);
  const loadRemoteBookmarks = useAuthStore((s) => s.loadRemoteBookmarks);
  const setProfile = useSocialStore((s) => s.setProfile);
  const bumpStreak = useSocialStore((s) => s.bumpStreak);
  const didRun = useRef(false);

  // Dev-only console helper: `await window.__devLogin('<DEV_AUTH_TOKEN>')` sets the
  // access token and loads the profile, so the /admin UI works without completing
  // QF OAuth. Stripped from production builds. Pair with the server DEV_AUTH_* env.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const w = window as unknown as { __devLogin?: (t: string) => Promise<void> };
    w.__devLogin = async (token: string) => {
      // Validate the token BEFORE setting/persisting it — a mistyped token must not
      // leave the app holding an invalid session (and falsely report success).
      const res = await fetch("/api/social/me", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        try {
          sessionStorage.removeItem("__devToken");
        } catch (e) { console.error("dev: failed to clear __devToken", e); }
        console.warn("dev login failed — token rejected");
        return;
      }
      setTokens(token);
      // Persist for this tab so a reload/hard-nav keeps the dev session (the real
      // access token is in-memory only by design).
      try {
        sessionStorage.setItem("__devToken", token);
      } catch (e) { console.error("dev: failed to persist __devToken", e); }
      const p = (await res.json()) as { id?: number; username?: string };
      if (p.id && p.username) setProfile({ userId: p.id, username: p.username });
      console.warn("dev login set — navigate to /admin");
    };
    // Auto-restore a saved dev session on reload.
    let saved: string | null = null;
    try {
      saved = sessionStorage.getItem("__devToken");
    } catch (e) { console.error("dev: failed to read __devToken", e); }
    if (saved) void w.__devLogin(saved);
  }, [setTokens, setProfile]);

  useEffect(() => {
    if (didRun.current) return;
    didRun.current = true;

    // If a token is already in memory we just signed in (the OAuth callback set
    // it and soft-navigated here). Calling refresh now would consume+rotate the
    // refresh-token cookie a second time; if the user then hard-navigates before
    // the rotated cookie commits, Ory sees the old token reused and revokes the
    // whole session — leaving them stuck on "Sign in". Skip the redundant call.
    if (useAuthStore.getState().accessToken) {
      setSessionLoaded();
      return;
    }

    // keepalive: let an in-flight refresh finish (and its rotated Set-Cookie be
    // applied) even if the user navigates away mid-request.
    fetch("/api/auth/refresh", { method: "POST", keepalive: true })
      .then(async (res) => {
        if (!res.ok) return;
        const { accessToken } = (await res.json()) as { accessToken?: string };
        if (!accessToken) return;
        setTokens(accessToken);

        const [profileRes] = await Promise.all([
          fetch("/api/social/me", { headers: { Authorization: `Bearer ${accessToken}` } }),
          loadRemoteBookmarks(),
        ]);

        if (profileRes.ok) {
          const p = (await profileRes.json()) as {
            id?: number;
            username?: string;
            currentStreak?: number;
            longestStreak?: number;
          };
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
      <TooltipProvider delayDuration={300}>
        <SessionRestorer />
        {children}
        <MiniPlayer />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
