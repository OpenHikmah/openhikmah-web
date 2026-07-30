"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useMobileNavVisible } from "@/hooks/useMobileNavVisible";
import { NAV_ITEMS, isNavItemActive } from "./nav-items";

// The mobile bottom tab bar for primary section navigation. Its desktop
// counterpart lives inline in the header row (see HeaderNavLinks) — both
// read from the shared NAV_ITEMS source; this bar shows only items not
// marked mobile: false (e.g. Bookmarks lives in the account menu here).
const MOBILE_ITEMS = NAV_ITEMS.filter((item) => item.mobile !== false);

export function MobileNavBar() {
  const pathname = usePathname();
  const visible = useMobileNavVisible();
  const t = useTranslations("nav");

  // See useMobileNavVisible for the hide condition (populated /canvas only).
  if (!visible) return null;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex md:hidden border-t border-border bg-surface/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
      {MOBILE_ITEMS.map(({ href, labelKey, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className={cn(
            "flex flex-1 flex-col items-center justify-center gap-1 min-h-[58px] px-1 text-[11px] font-medium transition-colors [&_svg]:size-[20px]",
            isNavItemActive(pathname, href) ? "text-teal" : "text-text-secondary"
          )}
        >
          <Icon />
          <span>{t(labelKey)}</span>
        </Link>
      ))}
    </nav>
  );
}
