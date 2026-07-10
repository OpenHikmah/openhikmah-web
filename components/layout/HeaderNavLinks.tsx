"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth";

// The single source of primary section navigation, rendered inline in the
// global header row. Bookmarks only appears here once signed in — it isn't
// duplicated in the AccountMenu dropdown, so there's exactly one home for it.
const ITEMS = [
  { href: "/canvas", label: "Canvas" },
  { href: "/names", label: "Asma’ul Husna" },
] as const;

export function HeaderNavLinks() {
  const pathname = usePathname();
  const accessToken = useAuthStore((s) => s.accessToken);

  const isActive = (href: string) =>
    href === "/canvas" ? pathname === "/canvas" : pathname.startsWith(href);

  const items = accessToken ? [...ITEMS, { href: "/bookmarks", label: "Bookmarks" }] : ITEMS;

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
