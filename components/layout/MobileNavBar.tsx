"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutTemplate, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/store/canvas";

// The mobile bottom tab bar for primary section navigation. Its desktop
// counterpart lives inline in the header row (see HeaderNavLinks) — the two
// share the same destinations but are rendered independently per breakpoint.
const ITEMS = [
  { href: "/canvas", label: "Canvas", icon: LayoutTemplate },
  { href: "/names", label: "Asma’ul Husna", icon: Sparkles },
] as const;

export function MobileNavBar() {
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

  if (hideMobileTabs) return null;

  return (
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
  );
}
