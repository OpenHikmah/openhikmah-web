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
      className={`absolute left-1/2 -translate-x-1/2 w-48 ${openUp ? "bottom-full mb-1" : "top-full mt-1"}`}
      style={{ zIndex: 9999 }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="rounded-md border overflow-hidden"
        style={{
          background: "var(--color-surface-overlay)",
          borderColor: "var(--color-border)",
          boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
        }}
      >
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
              style={{ background: `${opt.color}1a`, color: opt.color }}
            >
              {opt.icon}
            </span>
            <div className="min-w-0">
              <p
                className="text-xs font-medium"
                style={{ color: "var(--color-text-primary)" }}
              >
                {opt.label}
              </p>
              <p
                className="text-xs"
                style={{ color: "var(--color-text-muted)" }}
              >
                {opt.description}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
