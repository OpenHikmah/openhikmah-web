"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { useSocialStore } from "@/store/social";
import { Loader2 } from "lucide-react";

interface Props {
  code?: string;
  state?: string;
  error?: string;
}

export function CallbackClient({ code, state, error }: Props) {
  const router = useRouter();
  const { setTokens, loadRemoteBookmarks } = useAuthStore();
  const { setProfile } = useSocialStore();
  const didRun = useRef(false);

  useEffect(() => {
    if (didRun.current) return;
    didRun.current = true;

    if (error || !code) {
      router.replace("/");
      return;
    }

    const codeVerifier = sessionStorage.getItem("pkce_code_verifier");
    const expectedState = sessionStorage.getItem("pkce_state");

    // Verify CSRF state before doing anything with the code
    if (!codeVerifier || !expectedState || expectedState !== state) {
      sessionStorage.removeItem("pkce_code_verifier");
      sessionStorage.removeItem("pkce_state");
      sessionStorage.removeItem("pkce_nonce");
      router.replace("/");
      return;
    }

    sessionStorage.removeItem("pkce_code_verifier");
    sessionStorage.removeItem("pkce_state");
    sessionStorage.removeItem("pkce_nonce");

    fetch("/api/auth/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, codeVerifier }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("exchange failed");
        return res.json();
      })
      .then(async ({ accessToken, refreshToken, userId, username, isNewUser }) => {
        setTokens(accessToken, refreshToken ?? null);

        // Populate social profile if the server resolved user identity
        if (userId && username) {
          setProfile({ userId, username });
        }

        await loadRemoteBookmarks();

        // New users pick a username before using the app
        router.replace(isNewUser ? "/onboarding" : "/");
      })
      .catch(() => {
        router.replace("/");
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // ^ intentionally empty — didRun.current prevents double-fire in StrictMode;
  //   code/state/error come from URL params and never change after mount

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "var(--color-bg)" }}
    >
      <div className="flex items-center gap-2.5">
        <Loader2
          className="w-4 h-4 animate-spin"
          style={{ color: "var(--color-teal)" }}
        />
        <p
          className="text-sm font-mono"
          style={{ color: "var(--color-text-muted)" }}
        >
          Signing in…
        </p>
      </div>
    </div>
  );
}
