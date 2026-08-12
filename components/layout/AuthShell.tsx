"use client";

import { useTranslations } from "next-intl";
import { LogIn, Loader2 } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { useSignIn } from "@/hooks/useSignIn";
import { LandingHeader } from "./LandingHeader";

export function AuthShell({ children }: { children: React.ReactNode }) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const isSessionLoading = useAuthStore((s) => s.isSessionLoading);
  const { signIn, signingIn } = useSignIn();
  const t = useTranslations("authGate");
  const tCommon = useTranslations("common");

  const showContent = !isSessionLoading && accessToken;

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <LandingHeader />
      {showContent ? (
        children
      ) : isSessionLoading ? (
        <div className="flex flex-1 items-center justify-center" role="status" aria-label="Loading">
          <Loader2 className="h-5 w-5 animate-spin text-teal" />
        </div>
      ) : (
        // Session restoration has finished and there's genuinely no token —
        // show why, with a way back in, instead of silently bouncing to "/"
        // with no explanation of what happened to the link/bookmark the user
        // followed.
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
          <h1 className="text-base font-medium text-text-primary">{t("title")}</h1>
          <p className="max-w-sm text-sm text-text-muted">{t("body")}</p>
          <button
            onClick={signIn}
            disabled={signingIn}
            className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-gold px-3.5 py-1.5 text-[13px] font-semibold text-gold transition-colors duration-[120ms] hover:bg-gold/10 disabled:opacity-60"
          >
            {signingIn ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <LogIn className="size-3.5" />
            )}
            {signingIn ? tCommon("signingIn") : tCommon("signIn")}
          </button>
        </div>
      )}
    </div>
  );
}
