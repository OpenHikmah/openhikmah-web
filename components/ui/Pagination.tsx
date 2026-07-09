import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PaginationProps {
  page: number;
  totalPages: number;
  /** Builds the href for a given page number, e.g. `(p) => `/search?q=x&page=${p}`` */
  href: (page: number) => string;
  className?: string;
}

const SIBLINGS = 1;

/** Page numbers to render, with `"ellipsis"` markers where a run is collapsed. */
function pageRange(page: number, totalPages: number): Array<number | "ellipsis"> {
  const pages = new Set<number>([1, totalPages]);
  for (let p = page - SIBLINGS; p <= page + SIBLINGS; p++) {
    if (p >= 1 && p <= totalPages) pages.add(p);
  }
  const sorted = [...pages].sort((a, b) => a - b);
  const result: Array<number | "ellipsis"> = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) result.push("ellipsis");
    result.push(p);
  });
  return result;
}

export function Pagination({ page, totalPages, href, className }: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <nav
      aria-label="Pagination"
      className={cn("flex items-center justify-center gap-1", className)}
    >
      <PageLink
        page={page - 1}
        href={href}
        disabled={page <= 1}
        aria-label="Previous page"
        className="px-2"
      >
        <ChevronLeft className="w-4 h-4" />
      </PageLink>

      {pageRange(page, totalPages).map((p, i) =>
        p === "ellipsis" ? (
          <span key={`ellipsis-${i}`} className="px-2 text-sm text-text-muted">
            …
          </span>
        ) : (
          <PageLink key={p} page={p} href={href} active={p === page}>
            {p}
          </PageLink>
        )
      )}

      <PageLink
        page={page + 1}
        href={href}
        disabled={page >= totalPages}
        aria-label="Next page"
        className="px-2"
      >
        <ChevronRight className="w-4 h-4" />
      </PageLink>
    </nav>
  );
}

function PageLink({
  page,
  href: buildHref,
  active,
  disabled,
  className,
  children,
  ...props
}: {
  page: number;
  href: (page: number) => string;
  active?: boolean;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  const base =
    "inline-flex h-8 min-w-8 items-center justify-center rounded-md border text-sm font-mono transition-colors";

  if (disabled) {
    return (
      <span className={cn(base, "border-border text-text-muted/40 cursor-not-allowed", className)}>
        {children}
      </span>
    );
  }

  return (
    <Link
      href={buildHref(page)}
      className={cn(
        base,
        active
          ? "border-teal bg-teal/15 text-teal"
          : "border-border text-text-secondary hover:border-gold-muted hover:text-gold",
        className
      )}
      {...props}
    >
      {children}
    </Link>
  );
}
