"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Flame, Award, Heart, FolderOpen, Trophy, LogOut, LogIn, ChevronDown, Loader2, LayoutTemplate, Sparkles } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { useSocialStore } from "@/store/social";
import { buildAuthUrl } from "@/lib/pkce";
import { cn } from "@/lib/utils";

export function AccountMenu() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const isSessionLoading = useAuthStore((s) => s.isSessionLoading);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const bookmarkCount = useAuthStore((s) => s.bookmarks.length);
  const username = useSocialStore((s) => s.username);
  const streak = useSocialStore((s) => s.streak);
  const longestStreak = useSocialStore((s) => s.longestStreak);
  const pendingFriendCount = useSocialStore((s) => s.pendingFriendCount);

  const [open, setOpen] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const signIn = async () => {
    if (signingIn) return;
    setSigningIn(true);
    const { url, codeVerifier, state, nonce } = await buildAuthUrl();
    sessionStorage.setItem("pkce_code_verifier", codeVerifier);
    sessionStorage.setItem("pkce_state", state);
    sessionStorage.setItem("pkce_nonce", nonce);
    window.location.href = url;
  };

  const signOut = async () => {
    setOpen(false);
    await fetch("/api/auth/signout", { method: "POST" }).catch(() => {});
    clearAuth();
  };

  // While session is restoring, show a neutral skeleton pill so signed-in users
  // never see the "Sign in" button flash before the token is available.
  if (isSessionLoading && !accessToken) {
    return (
      <div className="h-[38px] w-[110px] animate-pulse rounded-full border border-border bg-surface-raised" />
    );
  }

  if (!accessToken) {
    return (
      <button
        onClick={signIn}
        disabled={signingIn}
        className="inline-flex items-center gap-1.5 rounded-md border border-gold px-3.5 py-1.5 text-[13px] font-semibold text-gold transition-colors duration-[120ms] hover:bg-gold/10 disabled:opacity-60"
      >
        {signingIn ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <LogIn className="size-3.5" />
        )}
        {signingIn ? "Signing in…" : "Sign in"}
      </button>
    );
  }

  const initial = (username ?? "?")[0].toUpperCase();
  const linkRow =
    "flex items-center gap-3 h-11 px-3 rounded-lg text-[13.5px] text-text-primary transition-colors hover:bg-white/5 [&_svg]:size-[17px] [&_svg]:text-text-secondary";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className={cn(
          "flex items-center gap-2 rounded-full border bg-surface-raised py-[3px] pl-[3px] pr-2 transition-colors sm:pr-3",
          open ? "border-gold-muted" : "border-border hover:border-gold-muted/70"
        )}
      >
        <span className="grid size-[30px] place-items-center rounded-full bg-teal text-[12px] font-bold text-bg shadow-[0_0_0_2px_color-mix(in_srgb,var(--color-teal)_25%,transparent)]">
          {initial}
        </span>
        {username && (
          <span className="hidden max-w-[140px] truncate text-[13.5px] text-text-primary sm:inline-block">
            {username}
          </span>
        )}
        {streak > 0 && (
          <span className="hidden items-center gap-0.5 text-gold sm:flex">
            <Flame className="size-[13px]" fill="currentColor" />
            <span className="text-xs font-semibold">{streak}</span>
          </span>
        )}
        <ChevronDown
          className={cn("hidden size-3.5 text-text-muted transition-transform sm:block", open && "rotate-180")}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-[268px] overflow-hidden rounded-2xl border border-border bg-surface-overlay shadow-floating"
        >
          <div
            className="flex items-center gap-3 p-4"
            style={{
              background:
                "radial-gradient(120% 100% at 0% 0%, color-mix(in srgb, var(--color-gold) 12%, transparent), transparent 60%), linear-gradient(180deg, color-mix(in srgb, var(--color-teal) 8%, transparent), transparent)",
            }}
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-teal text-[17px] font-bold text-bg shadow-[0_0_0_2px_color-mix(in_srgb,var(--color-gold)_30%,transparent)]">
              {initial}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold text-text-primary">
                {username ?? "Signed in"}
              </p>
              <p className="text-xs text-text-secondary">
                {streak > 0 ? `On a ${streak}-day streak` : "Signed in"}
              </p>
            </div>
          </div>

          <div className="flex gap-2 px-4 pb-3.5">
            <div className="flex-1 rounded-[10px] border border-border bg-surface px-2.5 py-2">
              <div className="flex items-center gap-1.5">
                <Flame className="size-[15px] text-gold" fill="currentColor" />
                <span className="text-[18px] font-bold leading-none text-gold">{streak}</span>
              </div>
              <p className="mt-1 text-[10.5px] uppercase tracking-[0.04em] text-text-muted">Day streak</p>
            </div>
            <div className="flex-1 rounded-[10px] border border-border bg-surface px-2.5 py-2">
              <div className="flex items-center gap-1.5">
                <Award className="size-[15px] text-gold" />
                <span className="text-[18px] font-bold leading-none text-text-primary">{longestStreak}</span>
              </div>
              <p className="mt-1 text-[10.5px] uppercase tracking-[0.04em] text-text-muted">Longest</p>
            </div>
          </div>

          <div className="h-px bg-border" />

          {/* Mobile-only nav shortcuts — desktop has the NavBar strip */}
          <div className="md:hidden p-1.5">
            <Link href="/canvas" onClick={() => setOpen(false)} className={linkRow}>
              <LayoutTemplate /> Canvas
            </Link>
            <Link href="/names" onClick={() => setOpen(false)} className={linkRow}>
              <Sparkles /> Asma&apos;ul Husna
            </Link>
          </div>

          <div className="md:hidden h-px bg-border" />

          <div className="p-1.5">
            <Link href="/bookmarks" onClick={() => setOpen(false)} className={linkRow}>
              <Heart /> Bookmarks
              {bookmarkCount > 0 && (
                <span className="ml-auto text-xs text-text-muted">{bookmarkCount}</span>
              )}
            </Link>
            <Link href="/workspaces" onClick={() => setOpen(false)} className={linkRow}>
              <FolderOpen /> Saved canvases
            </Link>
            <Link href="/social" onClick={() => setOpen(false)} className={linkRow}>
              <Trophy /> Friends &amp; Leaderboard
              {pendingFriendCount > 0 && (
                <span className="ml-auto grid h-[18px] min-w-[18px] place-items-center rounded-full bg-gold px-1 text-[10px] font-bold text-bg">
                  {pendingFriendCount > 9 ? "9+" : pendingFriendCount}
                </span>
              )}
            </Link>
          </div>

          <div className="h-px bg-border" />

          <div className="p-1.5">
            <button
              onClick={signOut}
              role="menuitem"
              className="flex h-11 w-full items-center gap-3 rounded-lg px-3 text-[13.5px] text-text-primary transition-colors hover:bg-error/10 hover:text-error [&_svg]:size-[17px] [&_svg]:text-text-secondary [&:hover_svg]:text-error"
            >
              <LogOut /> Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
