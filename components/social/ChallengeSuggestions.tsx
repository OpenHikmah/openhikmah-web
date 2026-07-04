"use client";

import { Sparkles, ArrowRight } from "lucide-react";

export interface Suggestion {
  id: number;
  title: string;
  description: string | null;
  verseRef: string | null;
  suggestedDuration: string | null;
}

interface Props {
  suggestions: Suggestion[];
  onPick: (s: Suggestion) => void;
}

/**
 * Admin-curated challenge ideas as a compact horizontal strip — picking one seeds
 * the create form below. Renders nothing when there are no active suggestions.
 */
export function ChallengeSuggestions({ suggestions, onPick }: Props) {
  if (suggestions.length === 0) return null;

  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-1.5 px-0.5 text-[11px] font-medium uppercase tracking-wide text-text-muted">
        <Sparkles className="h-3.5 w-3.5 text-teal" />
        Suggested
      </h3>
      <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
        {suggestions.map((s) => (
          <button
            key={s.id}
            onClick={() => onPick(s)}
            className="group flex w-52 shrink-0 snap-start flex-col gap-2 rounded-lg border border-border bg-surface p-3 text-left transition-colors hover:border-teal/50 hover:bg-surface-raised"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm font-medium leading-snug text-text-primary">{s.title}</span>
              {s.suggestedDuration && (
                <span className="shrink-0 rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-text-muted">
                  {s.suggestedDuration}
                </span>
              )}
            </div>
            {s.description && (
              <p className="line-clamp-2 text-xs leading-relaxed text-text-muted">
                {s.description}
              </p>
            )}
            <div className="mt-auto flex items-center justify-between pt-1">
              {s.verseRef ? (
                <span className="font-mono text-[11px] text-teal">{s.verseRef}</span>
              ) : (
                <span />
              )}
              <span className="flex items-center gap-0.5 text-[11px] font-medium text-text-secondary transition-colors group-hover:text-teal">
                Use <ArrowRight className="h-3 w-3" />
              </span>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
