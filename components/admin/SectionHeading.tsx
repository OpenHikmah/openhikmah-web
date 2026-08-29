import { cn } from "@/lib/utils";

/**
 * The standard in-page section header for the admin console — one tag (`h2`),
 * one weight (`font-semibold`). Use above a table or a settings panel; the page
 * title itself stays in `AdminPageHeader`.
 */
export function SectionHeading({
  title,
  subtitle,
  actions,
  className,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-2 flex items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
