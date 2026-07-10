"use client";

import { cn } from "@/lib/utils";

// Keyword → Quran.com text search. Meaning → semantic (embedding) search over the
// local corpus. Shared between the Command Modal and the /search page so the
// toggle UI/state is identical in both places.
export type SearchMode = "keyword" | "meaning";

interface SearchModeToggleProps {
  mode: SearchMode;
  onChange: (mode: SearchMode) => void;
  className?: string;
}

export function SearchModeToggle({ mode, onChange, className }: SearchModeToggleProps) {
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      {(["keyword", "meaning"] as SearchMode[]).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          aria-pressed={mode === m}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            mode === m ? "bg-teal/15 text-teal-bright" : "text-text-muted hover:text-text-secondary"
          )}
        >
          {m === "keyword" ? "Keyword" : "By meaning"}
        </button>
      ))}
      {mode === "meaning" && (
        <span className="ml-auto text-[10px] text-text-muted">semantic · finds related ideas</span>
      )}
    </div>
  );
}
