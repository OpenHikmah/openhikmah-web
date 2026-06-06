"use client";

import { useRef, useEffect, useState } from "react";
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
  const menuRef = useRef<HTMLDivElement>(null);
  const [openUp, setOpenUp] = useState(false);

  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    if (rect.bottom > window.innerHeight - 16) {
      setOpenUp(true);
    }
  }, []);

  return (
    <div
      ref={menuRef}
      className={`absolute left-1/2 z-50 w-48 -translate-x-1/2 ${openUp ? "bottom-full mb-1" : "top-full mt-1"}`}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="rounded-md border border-border overflow-hidden bg-surface-overlay shadow-sm">
        {OPTIONS.map((opt) => (
          <button
            key={opt.kind}
            onClick={() => {
              onSelect(opt.kind);
              onClose();
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors cursor-pointer hover:bg-white/5"
          >
            <span
              className="w-5 h-5 rounded flex items-center justify-center text-xs font-mono shrink-0"
              style={{ background: `color-mix(in srgb, ${opt.color} 12%, transparent)`, color: opt.color }}
            >
              {opt.icon}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-text-primary">{opt.label}</p>
              <p className="text-xs text-text-muted">{opt.description}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
