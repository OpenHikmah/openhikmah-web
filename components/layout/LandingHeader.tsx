"use client";

import Link from "next/link";
import { BookOpen } from "lucide-react";
import { AccountMenu } from "./AccountMenu";

/**
 * Minimal landing header (Quiet Minimal): wordmark + text nav + the account
 * control. The full canvas-tool header lives in components/layout/Header.tsx.
 */
export function LandingHeader() {
  return (
    <header className="flex items-center justify-between border-b border-border px-6 md:px-12" style={{ height: 60 }}>
      <Link href="/" className="flex items-center gap-2 transition-opacity hover:opacity-80">
        <BookOpen className="size-4 text-gold" />
        <span className="text-[15px] font-semibold text-text-primary">Open Hikmah</span>
      </Link>

      <nav className="flex items-center gap-4 md:gap-6">
        <Link href="/canvas" className="hidden whitespace-nowrap text-[13.5px] text-text-secondary transition-colors hover:text-text-primary sm:inline-block">
          Canvas
        </Link>
        <Link href="/names" className="whitespace-nowrap text-[13.5px] text-text-secondary transition-colors hover:text-text-primary">
          Asma&apos;ul Husna
        </Link>
        <AccountMenu />
      </nav>
    </header>
  );
}
