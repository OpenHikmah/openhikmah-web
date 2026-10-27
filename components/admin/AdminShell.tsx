"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FocusScope } from "@radix-ui/react-focus-scope";
import {
  LayoutDashboard,
  CalendarDays,
  Network,
  Users,
  Swords,
  Coins,
  Flag,
  BookOpen,
  BookMarked,
  Server,
  ScrollText,
  MessageSquareText,
  BarChart3,
  PlayCircle,
  ListChecks,
  Menu,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdmin } from "./AdminContext";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

// The console's modules, grouped by the kind of work. Within a group the
// highest-frequency operator tasks come first.
const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Insight",
    items: [
      { href: "/admin", label: "Overview", icon: LayoutDashboard },
      { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
      { href: "/admin/coverage", label: "Coverage", icon: ListChecks },
      { href: "/admin/ai", label: "AI & Cost", icon: Coins },
    ],
  },
  {
    label: "Content",
    items: [
      { href: "/admin/votd", label: "Verse of the Day", icon: CalendarDays },
      { href: "/admin/connections", label: "Connections", icon: Network },
      { href: "/admin/names", label: "Names Content", icon: BookOpen },
      { href: "/admin/stories", label: "Stories", icon: BookMarked },
      { href: "/admin/prompts", label: "Prompts", icon: MessageSquareText },
    ],
  },
  {
    label: "People",
    items: [
      { href: "/admin/users", label: "Users", icon: Users },
      { href: "/admin/challenges", label: "Challenges", icon: Swords },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/admin/flags", label: "Feature Flags", icon: Flag },
      { href: "/admin/jobs", label: "Jobs", icon: PlayCircle },
      { href: "/admin/infra", label: "Infra", icon: Server },
      { href: "/admin/audit", label: "Audit Log", icon: ScrollText },
    ],
  },
];

const NAV = NAV_GROUPS.flatMap((g) => g.items);

const DRAWER_ID = "admin-mobile-nav";

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function currentTitle(pathname: string): string {
  return NAV.find((n) => isActive(pathname, n.href))?.label ?? "Admin";
}

/** The module list + operator identity footer, shared by the persistent desktop
 *  sidebar and the off-canvas mobile drawer. */
function SidebarContent({
  pathname,
  username,
  onNavigate,
}: {
  pathname: string;
  username: string;
  onNavigate?: () => void;
}) {
  return (
    <>
      <div className="flex items-baseline gap-2 px-5 py-5">
        <span lang="ar" dir="rtl" className="font-arabic text-lg text-gold">
          حكمة
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-muted">
          admin
        </span>
      </div>

      <nav aria-label="Admin" className="flex flex-1 flex-col gap-4 px-2.5 pb-3">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="flex flex-col gap-0.5">
            <p className="px-3 pb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
              {group.label}
            </p>
            {group.items.map(({ href, label, icon: Icon }) => {
              const active = isActive(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-[color,background-color] duration-[120ms]",
                    active
                      ? "bg-gold/10 font-medium text-gold"
                      : "text-text-secondary hover:bg-white/5 hover:text-text-primary"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" strokeWidth={active ? 2.25 : 1.75} />
                  {label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="border-t border-border px-5 py-3.5">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-teal" />
          <span className="truncate text-xs text-text-secondary">{username}</span>
        </div>
        <Link href="/" className="mt-1 block text-[11px] text-text-muted hover:text-gold">
          ← Back to app
        </Link>
      </div>
    </>
  );
}

/** The off-canvas nav drawer shown below the `sm` breakpoint, opened from the
 *  mobile top bar's hamburger button. Mirrors the MoreSheet/ExpandMenu focus-
 *  trap pattern used elsewhere in the app. */
function MobileSidebarDrawer({
  pathname,
  username,
  onClose,
  triggerRef,
}: {
  pathname: string;
  username: string;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLElement | null>;
}) {
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        drawerRef.current &&
        !drawerRef.current.contains(target) &&
        !triggerRef.current?.contains(target)
      ) {
        onClose();
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [onClose, triggerRef]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 sm:hidden">
      <FocusScope asChild trapped loop>
        <div
          ref={drawerRef}
          id={DRAWER_ID}
          role="dialog"
          aria-modal="true"
          aria-label="Admin navigation"
          className="flex h-full w-64 max-w-[80vw] flex-col overflow-y-auto border-r border-border bg-surface"
        >
          <div className="flex items-center justify-end px-2.5 pt-2.5">
            <button
              type="button"
              onClick={onClose}
              aria-label="Close menu"
              className="rounded-md p-1.5 text-text-muted hover:bg-white/5 hover:text-text-primary"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <SidebarContent pathname={pathname} username={username} onNavigate={onClose} />
        </div>
      </FocusScope>
    </div>
  );
}

/**
 * The dense operator-console frame (design direction A): a persistent left
 * sidebar of modules + a top context bar, on the locked navy/gold/teal palette.
 * Gold marks the active module; the work area is filled per-page. Below `sm`,
 * the sidebar collapses behind a hamburger-triggered off-canvas drawer.
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { username } = useAdmin();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="flex min-h-dvh flex-col bg-bg text-text-primary sm:flex-row">
      <div className="sticky top-0 z-40 flex items-center gap-2 border-b border-border bg-surface px-3 py-2.5 sm:hidden">
        <button
          ref={menuButtonRef}
          type="button"
          onClick={() => setMobileNavOpen((v) => !v)}
          aria-label="Open menu"
          aria-expanded={mobileNavOpen}
          aria-controls={DRAWER_ID}
          className="rounded-md p-1.5 text-text-secondary hover:bg-white/5 hover:text-text-primary"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span lang="ar" dir="rtl" className="font-arabic text-base text-gold">
          حكمة
        </span>
        <span className="truncate text-sm font-medium text-text-primary">
          {currentTitle(pathname)}
        </span>
      </div>

      {mobileNavOpen && (
        <MobileSidebarDrawer
          pathname={pathname}
          username={username}
          onClose={() => setMobileNavOpen(false)}
          triggerRef={menuButtonRef}
        />
      )}

      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col overflow-y-auto border-r border-border bg-surface sm:flex">
        <SidebarContent pathname={pathname} username={username} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

/**
 * Standard page header inside the work area: a title, optional subtitle, and an
 * optional actions slot on the right. Keeps every module visually consistent.
 */
export function AdminPageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  useEffect(() => {
    document.title = `${title} — Admin — Open Hikmah`;
  }, [title]);

  return (
    <>
      <header className="px-4 pb-4 pt-5 sm:px-7">
        <div className="min-w-0">
          <h1 className="relative pl-3 text-xl font-semibold text-text-primary before:absolute before:bottom-1 before:left-0 before:top-1 before:w-[3px] before:rounded-full before:bg-gold before:content-['']">
            {title}
          </h1>
          {subtitle && <p className="mt-1 pl-3 text-sm text-text-secondary">{subtitle}</p>}
        </div>
      </header>
      {/* Gold accent rule, fading to the right. */}
      <div className="h-px bg-gradient-to-r from-gold/70 to-transparent" />
      {actions && (
        <div className="border-b border-border px-4 py-3 sm:px-7">
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        </div>
      )}
    </>
  );
}
