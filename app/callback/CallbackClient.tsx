"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuthStore } from "@/store/auth";
import { useSocialStore } from "@/store/social";
import { mergeGuestWorkspace } from "@/hooks/useCanvasPersistence";
import { Loader2 } from "lucide-react";

type FailReason =
  | { key: "sessionExpired" | "stateMismatch" | "noAuthorizationCode" | "unexpectedError" }
  | { key: "providerError"; error: string };

interface Props {
  code?: string;
  state?: string;
  error?: string;
}

export function CallbackClient({ code, state, error }: Props) {
  const router = useRouter();
  const t = useTranslations("callback");
  const tCommon = useTranslations("common");
  const { setTokens, loadRemoteBookmarks } = useAuthStore();
  const { setProfile } = useSocialStore();
  const didRun = useRef(false);
  const [failReason, setFailReason] = useState<FailReason | null>(null);

  useEffect(() => {
    if (didRun.current) return;
    didRun.current = true;

    if (error || !code) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFailReason(error ? { key: "providerError", error } : { key: "noAuthorizationCode" });
      return;
    }

    const codeVerifier = sessionStorage.getItem("pkce_code_verifier");
    const expectedState = sessionStorage.getItem("pkce_state");
    const nonce = sessionStorage.getItem("pkce_nonce");

    if (!codeVerifier || !expectedState || !nonce) {
      setFailReason({ key: "sessionExpired" });
      sessionStorage.removeItem("pkce_code_verifier");
      sessionStorage.removeItem("pkce_state");
      sessionStorage.removeItem("pkce_nonce");
      return;
    }

    if (expectedState !== state) {
      setFailReason({ key: "stateMismatch" });
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
      body: JSON.stringify({ code, codeVerifier, state, nonce }),
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
        await mergeGuestWorkspace(accessToken);

        router.replace(isNewUser ? "/onboarding" : "/");
      })
      .catch((err: unknown) => {
        console.error("Auth callback failed:", err instanceof Error ? err.message : err);
        setFailReason({ key: "unexpectedError" });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (failReason) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <div className="flex max-w-sm flex-col items-center gap-4 px-4 text-center">
          <div role="alert" className="flex flex-col items-center gap-4">
            <p className="font-mono text-sm text-text-muted">{t("signInFailed")}</p>
            <p className="rounded border border-border bg-surface px-3 py-2 font-mono text-xs text-text-muted">
              {failReason.key === "providerError"
                ? t("providerError", { error: failReason.error })
                : t(failReason.key)}
            </p>
          </div>
          <button onClick={() => router.replace("/")} className="text-xs text-teal underline">
            {t("backToHome")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg">
      <div role="status" className="flex items-center gap-2.5">
        <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin text-teal" />
        <p className="font-mono text-sm text-text-muted">{tCommon("signingIn")}</p>
      </div>
    </div>
  );
}
