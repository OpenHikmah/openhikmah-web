"use client";

import Link from "next/link";
import { AccountMenu } from "./AccountMenu";
import { Wordmark } from "./Wordmark";

/**
 * Minimal landing header (Quiet Minimal): wordmark + text nav + the account
 * control. The full canvas-tool header lives in components/layout/Header.tsx.
 */
const navLink =
  "relative whitespace-nowrap rounded-md px-1 py-1 text-[13.5px] text-text-secondary transition-colors hover:text-text-primary";

export function LandingHeader() {
  return (
    <header className="sticky top-0 z-30 flex h-[60px] items-center justify-between border-b border-border bg-bg/80 px-6 backdrop-blur-sm md:px-12">
      <Wordmark />

      <nav className="flex items-center gap-3 md:gap-5">
        <Link href="/canvas" className={`${navLink} hidden sm:inline-block`}>
          Canvas
        </Link>
        <Link href="/names" className={navLink}>
          Asma&apos;ul Husna
        </Link>
        <AccountMenu />
      </nav>
    </header>
  );
}
