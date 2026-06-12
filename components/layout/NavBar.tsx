"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutTemplate, Sparkles, Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth";
import { useCanvasStore } from "@/store/canvas";

const BASE_ITEMS = [
  { href: "/canvas", label: "Canvas", icon: LayoutTemplate },
  { href: "/names", label: "Asma’ul Husna", icon: Sparkles },
] as const;

const BOOKMARKS_ITEM = { href: "/bookmarks", label: "Bookmarks", icon: Heart } as const;

export function NavBar() {
  const pathname = usePathname();
  const accessToken = useAuthStore((s) => s.accessToken);
  const nodeCount = useCanvasStore((s) => s.nodes.length);

  const items = accessToken ? [...BASE_ITEMS, BOOKMARKS_ITEM] : [...BASE_ITEMS];

  const isActive = (href: string) =>
    href === "/canvas" ? pathname === "/canvas" : pathname.startsWith(href);

  // Canvas action bar owns the mobile bottom strip when there are nodes on canvas.
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
