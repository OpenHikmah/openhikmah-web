"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// The single source of primary section navigation, rendered inline in the
// global header row. Bookmarks is always visible — guests can bookmark
// verses in localStorage and sync them on sign-in.
const ITEMS = [
  { href: "/canvas", label: "Canvas" },
  { href: "/search", label: "Search" },
  { href: "/names", label: "Asma'ul Husna" },
  { href: "/bookmarks", label: "Bookmarks" },
] as const;

export function HeaderNavLinks() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/canvas" ? pathname === "/canvas" : pathname.startsWith(href);

  const items = ITEMS;

  return (
    <nav className="hidden md:flex h-full items-center gap-0.5">
      {items.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          className={cn(
            "relative flex items-center px-3 h-full text-sm rounded-md transition-colors",
            isActive(href)
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
