"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutTemplate, Sparkles, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/store/canvas";

// The NavBar is the single place for primary section navigation. Personal items
// (Bookmarks, Saved canvases, Friends) live in the AccountMenu — never duplicated
// here — so there is exactly one home for each destination.
const ITEMS = [
  { href: "/canvas", label: "Canvas", icon: LayoutTemplate },
  { href: "/search", label: "Search", icon: Search },
  { href: "/names", label: "Asma’ul Husna", icon: Sparkles },
] as const;

export function NavBar() {
  const pathname = usePathname();
  const nodeCount = useCanvasStore((s) => s.nodes.length);

  const items = ITEMS;

  const isActive = (href: string) =>
    href === "/canvas" ? pathname === "/canvas" : pathname.startsWith(href);

  // On the canvas, hide the mobile tabs only once it has nodes — that's when the
  // Header's mobile action bar takes over the bottom edge (and the two fixed bars
  // would otherwise collide). On an empty canvas the tabs stay, so mobile users
  // can still navigate away (the EmptyState is centred and isn't obscured).
  const hideMobileTabs = pathname === "/canvas" && nodeCount > 0;

  return (
    <>
      {/* Desktop: compact nav strip below the header */}
      <nav className="hidden md:flex h-11 shrink-0 items-center gap-0.5 border-b border-border bg-bg px-6 md:px-12">
        {items.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "relative flex items-center px-3 h-full text-sm transition-colors",
              isActive(href)
                ? "text-text-primary font-medium after:absolute after:bottom-0 after:left-3 after:right-3 after:h-0.5 after:bg-teal"
                : "text-text-muted hover:text-text-secondary"
            )}
          >
            {label}
          </Link>
        ))}
      </nav>

      {/* Mobile: fixed bottom tab bar */}
      {!hideMobileTabs && (
        <nav className="fixed inset-x-0 bottom-0 z-30 flex md:hidden border-t border-border bg-surface/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
          {items.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-1 min-h-[58px] px-1 text-[11px] font-medium transition-colors [&_svg]:size-[20px]",
                isActive(href) ? "text-teal" : "text-text-secondary"
              )}
            >
              <Icon />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
      )}
    </>
  );
}
