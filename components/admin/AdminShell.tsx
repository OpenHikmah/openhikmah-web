"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CalendarDays,
  Network,
  Users,
  Swords,
  Coins,
  Flag,
  BookOpen,
  Server,
  ScrollText,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdmin } from "./AdminContext";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

// The console's modules, in the order they appear in the sidebar. Keep the
// highest-frequency operator tasks near the top.
const NAV: NavItem[] = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/votd", label: "Verse of the Day", icon: CalendarDays },
  { href: "/admin/connections", label: "Connections", icon: Network },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/challenges", label: "Challenges", icon: Swords },
  { href: "/admin/ai", label: "AI & Cost", icon: Coins },
  { href: "/admin/flags", label: "Feature Flags", icon: Flag },
  { href: "/admin/names", label: "Names Content", icon: BookOpen },
  { href: "/admin/infra", label: "Infra", icon: Server },
  { href: "/admin/audit", label: "Audit Log", icon: ScrollText },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The dense operator-console frame (design direction A): a persistent left
 * sidebar of modules + a top context bar, on the locked navy/gold/teal palette.
 * Gold marks the active module; the work area is filled per-page.
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { username } = useAdmin();

  return (
    <div className="flex min-h-dvh bg-bg text-text-primary">
      <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-surface">
        <div className="flex items-baseline gap-2 px-5 py-5">
          <span className="font-arabic text-lg text-gold">حكمة</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-muted">
            admin
          </span>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 px-2.5">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
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
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Branded letterhead — logo + project name, top-right of every admin page. */}
        <div className="flex h-12 shrink-0 items-center justify-end gap-2.5 border-b border-border px-7">
          <Image src="/logo-mark.png" alt="" width={20} height={20} className="size-5" />
          <span className="font-arabic text-[19px] leading-none tracking-wide text-text-primary">
            Open <span className="text-gold">Hikmah</span>
          </span>
        </div>
        {children}
      </div>
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
  return (
    <header className="flex items-start justify-between gap-4 border-b border-border px-7 py-5">
      <div>
        <h1 className="text-base font-semibold text-text-primary">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-text-secondary">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
