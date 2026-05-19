"use client";

import type { EdgeKind } from "@/types/quran";

interface ExpandMenuProps {
  onSelect: (kind: EdgeKind) => void;
  onClose: () => void;
}

const OPTIONS: Array<{
  kind: EdgeKind;
  label: string;
  description: string;
  color: string;
  icon: string;
}> = [
  {
    kind: "thematic",
    label: "By Theme",
    description: "Same theological meaning",
    color: "var(--color-teal)",
    icon: "◈",
  },
  {
    kind: "root",
    label: "By Root Word",
    description: "Shared Arabic root",
    color: "var(--color-gold)",
    icon: "ع",
  },
  {
    kind: "contrast",
    label: "By Contrast",
    description: "Opposing concept",
    color: "var(--color-contrast-edge)",
    icon: "↔",
  },
];

export function ExpandMenu({ onSelect, onClose }: ExpandMenuProps) {
  return (
    <>
      <div
        className="fixed inset-0 z-10"
        onClick={onClose}
        onMouseDown={(e) => e.stopPropagation()}
      />
      <div
        className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-20 w-52"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="rounded-xl border overflow-hidden shadow-xl"
          style={{
            background: "var(--color-surface-overlay)",
            borderColor: "var(--color-border)",
          }}
        >
          <div className="px-3 py-2 border-b" style={{ borderColor: "var(--color-border)" }}>
            <p
              className="text-xs font-mono uppercase tracking-wider"
              style={{ color: "var(--color-text-muted)" }}
            >
              Expand connections
            </p>
          </div>
          {OPTIONS.map((opt) => (
            <button
              key={opt.kind}
              onClick={() => {
                onSelect(opt.kind);
                onClose();
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-white/5"
            >
              <span
                className="w-6 h-6 rounded-md flex items-center justify-center text-sm font-mono shrink-0"
                style={{ background: `${opt.color}22`, color: opt.color }}
              >
                {opt.icon}
              </span>
              <div className="min-w-0">
                <p
                  className="text-sm font-medium leading-tight"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  {opt.label}
                </p>
                <p
                  className="text-xs leading-tight"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  {opt.description}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
