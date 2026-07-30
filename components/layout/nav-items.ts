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
  /** Key into the "nav" messages namespace — resolve with useTranslations("nav"). */
  labelKey: "canvas" | "search" | "stories" | "names" | "bookmarks";
  icon: LucideIcon;
  /** Shown in the mobile bottom tab bar. Defaults to true. */
  mobile?: boolean;
}

// Single source of primary section navigation, consumed by both
// HeaderNavLinks (desktop, all items) and MobileNavBar (mobile, items with
// mobile !== false). Bookmarks is desktop-only — on mobile it lives in the
// account menu to keep the bottom bar to 4 tabs.
export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/canvas", labelKey: "canvas", icon: LayoutTemplate },
  { href: "/search", labelKey: "search", icon: Search },
  { href: "/stories", labelKey: "stories", icon: ScrollText },
  { href: "/names", labelKey: "names", icon: Sparkles },
  { href: "/bookmarks", labelKey: "bookmarks", icon: Bookmark, mobile: false },
] as const;

export function isNavItemActive(pathname: string, href: string): boolean {
  return href === "/canvas"
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}
