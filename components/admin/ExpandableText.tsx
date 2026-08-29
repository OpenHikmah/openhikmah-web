"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Clamps long text to `lines` rows and adds a "Show more / Show less" toggle —
 * but only when the text actually overflows the clamp. Used for admin table
 * cells (connection reasons, prompt templates, audit meta) that are usually
 * short but occasionally paragraph-length.
 */
export function ExpandableText({
  children,
  lines = 2,
  className,
}: {
  children: string;
  lines?: number;
  className?: string;
}) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [overflows, setOverflows] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useLayoutEffect(() => {
    if (expanded) return;
    const el = ref.current;
    if (!el) return;
    // Measure against the clamped height: scrollHeight > clientHeight means
    // there's hidden content worth a toggle. Re-measure on resize too — a table
    // cell narrowing can push previously-fitting text into overflow.
    const measure = () => setOverflows(el.scrollHeight - el.clientHeight > 1);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [children, lines, expanded]);

  return (
    <div className={className}>
      <p
        ref={ref}
        className={cn(!expanded && "overflow-hidden")}
        style={
          expanded
            ? undefined
            : {
                display: "-webkit-box",
                WebkitBoxOrient: "vertical",
                WebkitLineClamp: lines,
              }
        }
      >
        {children}
      </p>
      {overflows && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-gold hover:underline"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}
