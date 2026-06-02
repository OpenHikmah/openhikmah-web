"use client";

import Link from "next/link";
import { BookOpen, Flame } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { useSocialStore } from "@/store/social";
import { buildAuthUrl } from "@/lib/pkce";

/**
 * Minimal landing header (Quiet Minimal): wordmark + text nav + one action.
 * The full canvas-tool header lives in components/layout/Header.tsx.
 */
export function LandingHeader() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const username = useSocialStore((s) => s.username);
  const streak = useSocialStore((s) => s.streak);

  const handleSignIn = async () => {
    const { url, codeVerifier, state, nonce } = await buildAuthUrl();
    sessionStorage.setItem("pkce_code_verifier", codeVerifier);
    sessionStorage.setItem("pkce_state", state);
    sessionStorage.setItem("pkce_nonce", nonce);
    window.location.href = url;
  };

  return (
    <header className="flex items-center justify-between border-b border-border px-6 md:px-12" style={{ height: 60 }}>
      <Link href="/" className="flex items-center gap-2 transition-opacity hover:opacity-80">
        <BookOpen className="size-4 text-gold" />
        <span className="text-[15px] font-semibold text-text-primary">Open Hikmah</span>
      </Link>

      <nav className="flex items-center gap-6">
        <Link href="/canvas" className="text-[13.5px] text-text-secondary transition-colors hover:text-text-primary">
          Canvas
        </Link>
        <Link href="/names" className="text-[13.5px] text-text-secondary transition-colors hover:text-text-primary">
          Asma&apos;ul Husna
        </Link>
        {accessToken ? (
          <span className="flex items-center gap-1.5 rounded-md border border-border bg-surface-raised px-2.5 py-1 text-[13px] text-text-primary">
            <span className="grid size-5 place-items-center rounded-full bg-teal text-[10px] font-bold text-bg">
              {(username ?? "?")[0].toUpperCase()}
            </span>
            {username && <span className="max-w-[96px] truncate">{username}</span>}
            {streak > 0 && (
              <>
                <Flame className="size-3 text-gold" fill="currentColor" />
                <span className="text-gold">{streak}</span>
              </>
            )}
          </span>
        ) : (
          <button
            onClick={handleSignIn}
            className="rounded-md bg-gold px-4 py-1.5 text-[13px] font-semibold text-[#1a1305] transition-[filter] duration-[120ms] hover:brightness-110"
          >
            Sign in
          </button>
        )}
      </nav>
    </header>
  );
}
