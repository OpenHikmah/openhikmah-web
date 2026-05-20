"use client";

import { useEffect, useRef, useState } from "react";
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
  const [failReason, setFailReason] = useState<string | null>(null);

  useEffect(() => {
    if (didRun.current) return;
    didRun.current = true;

    if (error || !code) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFailReason(error ?? "No authorization code received.");
      return;
    }

    const codeVerifier = sessionStorage.getItem("pkce_code_verifier");
    const expectedState = sessionStorage.getItem("pkce_state");

    if (!codeVerifier || !expectedState) {
      setFailReason("Session expired — please try signing in again.");
      sessionStorage.removeItem("pkce_code_verifier");
      sessionStorage.removeItem("pkce_state");
      sessionStorage.removeItem("pkce_nonce");
      return;
    }

    if (expectedState !== state) {
      setFailReason("State mismatch — possible CSRF attempt. Please try again.");
      sessionStorage.removeItem("pkce_code_verifier");
      sessionStorage.removeItem("pkce_state");
      sessionStorage.removeItem("pkce_nonce");
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
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`Exchange failed (${res.status})${text ? `: ${text}` : ""}`);
        }
        return res.json();
      })
      .then(async ({ accessToken, userId, username, isNewUser }) => {
        if (!accessToken) throw new Error("No access token in response.");
        setTokens(accessToken);

        if (userId && username) {
          setProfile({ userId, username });
        }

        await loadRemoteBookmarks();

        router.replace(isNewUser ? "/onboarding" : "/");
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Unknown error during sign-in.";
        console.error("Auth callback failed:", msg);
        setFailReason(msg);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (failReason) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "var(--color-bg)" }}
      >
        <div className="flex flex-col items-center gap-4 max-w-sm text-center px-4">
          <p className="text-sm font-mono" style={{ color: "var(--color-text-muted)" }}>
            Sign-in failed
          </p>
          <p className="text-xs font-mono px-3 py-2 rounded" style={{ background: "var(--color-surface)", color: "var(--color-text-muted)", border: "1px solid var(--color-border)" }}>
            {failReason}
          </p>
          <button
            onClick={() => router.replace("/")}
            className="text-xs underline"
            style={{ color: "var(--color-teal)" }}
          >
            Back to home
          </button>
        </div>
      </div>
    );
  }

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
