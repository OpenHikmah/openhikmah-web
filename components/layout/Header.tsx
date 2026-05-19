"use client";

import Link from "next/link";
import { BookOpen, Search, RotateCcw, LogIn, LogOut, Sparkles } from "lucide-react";
import { useCanvasStore } from "@/store/canvas";
import { useAuthStore } from "@/store/auth";
import { buildAuthUrl } from "@/lib/pkce";

interface HeaderProps {
  onSearchOpen: () => void;
}

export function Header({ onSearchOpen }: HeaderProps) {
  const reset = useCanvasStore((s) => s.reset);
  const nodeCount = useCanvasStore((s) => s.nodes.length);
  const accessToken = useAuthStore((s) => s.accessToken);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  const handleSignIn = async () => {
    const { url, codeVerifier, state } = await buildAuthUrl();
    sessionStorage.setItem("pkce_code_verifier", codeVerifier);
    sessionStorage.setItem("pkce_state", state);
    window.location.href = url;
  };

  return (
    <header
      className="flex items-center justify-between px-4 h-12 shrink-0"
      style={{
        background: "var(--color-surface)",
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2">
        <BookOpen className="w-4 h-4" style={{ color: "var(--color-gold)" }} />
        <span
          className="text-sm font-medium"
          style={{ color: "var(--color-text-primary)" }}
        >
          Open Hikmah
        </span>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-2">
        {nodeCount > 0 && (
          <span
            className="text-xs font-mono"
            style={{ color: "var(--color-text-muted)" }}
          >
            {nodeCount} verse{nodeCount !== 1 ? "s" : ""}
          </span>
        )}

        {nodeCount > 0 && (
          <button
            onClick={reset}
            title="Clear canvas"
            aria-label="Clear all verses from canvas"
            className="w-7 h-7 rounded border flex items-center justify-center transition-colors cursor-pointer hover:border-red-700 hover:text-red-400"
            style={{
              borderColor: "var(--color-border)",
              color: "var(--color-text-muted)",
            }}
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        )}

        <Link
          href="/names"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-xs transition-colors border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-gold)] hover:text-[var(--color-gold)]"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>99 Names</span>
        </Link>

        <button
          onClick={onSearchOpen}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-xs transition-colors cursor-pointer border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-gold)] hover:text-[var(--color-gold)]"
        >
          <Search className="w-3.5 h-3.5" />
          <span>Search</span>
          <kbd
            className="ml-0.5 text-[10px] font-mono px-1 rounded"
            style={{ color: "var(--color-text-muted)", background: "var(--color-surface-overlay)" }}
          >
            ⌘K
          </kbd>
        </button>

        {accessToken ? (
          <button
            onClick={clearAuth}
            title="Sign out"
            aria-label="Sign out"
            className="w-7 h-7 rounded border flex items-center justify-center transition-colors cursor-pointer hover:border-[var(--color-text-secondary)] hover:text-[var(--color-text-secondary)]"
            style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        ) : (
          <button
            onClick={handleSignIn}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-xs transition-colors cursor-pointer border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-teal)] hover:text-[var(--color-teal)]"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Sign in</span>
          </button>
        )}
      </div>
    </header>
  );
}
