import {
  LayoutTemplate,
  Search,
  ScrollText,
  Sparkles,
  Bookmark,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shown in the mobile bottom tab bar. Defaults to true. */
  mobile?: boolean;
}

// Single source of primary section navigation, consumed by both
// HeaderNavLinks (desktop, all items) and MobileNavBar (mobile, items with
// mobile !== false). Bookmarks is desktop-only — on mobile it lives in the
// account menu to keep the bottom bar to 4 tabs.
export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/canvas", label: "Canvas", icon: LayoutTemplate },
  { href: "/search", label: "Search", icon: Search },
  { href: "/stories", label: "Stories", icon: ScrollText },
  { href: "/names", label: "Asma'ul Husna", icon: Sparkles },
  { href: "/bookmarks", label: "Bookmarks", icon: Bookmark, mobile: false },
] as const;

export function isNavItemActive(pathname: string, href: string): boolean {
  return href === "/canvas"
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}
