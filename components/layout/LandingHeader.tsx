"use client";

import Link from "next/link";
import { AccountMenu } from "./AccountMenu";
import { Wordmark } from "./Wordmark";

/**
 * Minimal landing header (Quiet Minimal): wordmark + text nav + the account
 * control. The full canvas-tool header lives in components/layout/Header.tsx.
 */
export function LandingHeader() {
  return (
    <header className="flex h-[60px] items-center justify-between border-b border-border px-6 md:px-12">
      <Wordmark />

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
