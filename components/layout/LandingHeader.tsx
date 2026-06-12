"use client";

import { AccountMenu } from "./AccountMenu";
import { Wordmark } from "./Wordmark";

export function LandingHeader() {
  return (
    <header className="sticky top-0 z-30 flex h-[60px] items-center justify-between border-b border-border bg-bg/80 px-6 backdrop-blur-sm md:px-12">
      <Wordmark />
      <AccountMenu />
    </header>
  );
}
