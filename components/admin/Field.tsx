/**
 * Label wrapper for a single admin form control. Pairs the caption with the
 * input it labels (wrap an `Input`/`Select`/`Textarea` as the child).
 */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs text-text-secondary">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-text-muted">{hint}</span>}
    </label>
  );
}
