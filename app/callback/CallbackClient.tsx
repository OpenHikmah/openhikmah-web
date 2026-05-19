"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { Loader2 } from "lucide-react";

interface Props {
  code?: string;
  error?: string;
}

export function CallbackClient({ code, error }: Props) {
  const router = useRouter();
  const { setTokens, loadRemoteBookmarks } = useAuthStore();
  const didRun = useRef(false);

  useEffect(() => {
    if (didRun.current) return;
    didRun.current = true;

    if (error || !code) {
      router.replace("/");
      return;
    }

    const codeVerifier = sessionStorage.getItem("pkce_code_verifier");
    if (!codeVerifier) {
      router.replace("/");
      return;
    }

    sessionStorage.removeItem("pkce_code_verifier");

    fetch("/api/auth/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, codeVerifier }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("exchange failed");
        return res.json();
      })
      .then(async ({ accessToken, refreshToken }) => {
        setTokens(accessToken, refreshToken ?? null);
        await loadRemoteBookmarks();
        router.replace("/");
      })
      .catch(() => {
        router.replace("/");
      });
  }, []);

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
