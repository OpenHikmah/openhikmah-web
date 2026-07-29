"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, isNavItemActive } from "./nav-items";

export function HeaderNavLinks() {
  const pathname = usePathname();

  return (
    <nav className="hidden md:flex h-full items-center gap-0.5">
      {NAV_ITEMS.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          className={cn(
            "relative flex items-center px-3 h-full text-sm rounded-md transition-colors",
            isNavItemActive(pathname, href)
              ? "text-text-primary font-medium after:absolute after:bottom-0 after:left-3 after:right-3 after:h-0.5 after:bg-teal"
              : "text-text-muted hover:text-text-secondary hover:bg-white/5"
          )}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
