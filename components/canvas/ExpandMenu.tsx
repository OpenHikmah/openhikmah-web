"use client";

import { useEffect } from "react";
import { FocusScope } from "@radix-ui/react-focus-scope";
import { useTranslations } from "next-intl";
import type { EdgeKind, VerseRef } from "@/types/quran";

interface ExpandMenuProps {
  verseRef: VerseRef;
  onSelect: (kind: EdgeKind) => void;
  onClose: () => void;
}

const OPTIONS: Array<{
  kind: EdgeKind;
  labelKey: "byTheme" | "byRoot" | "byContrast";
  descriptionKey: "byThemeDescription" | "byRootDescription" | "byContrastDescription";
  color: string;
  icon: string;
}> = [
  {
    kind: "thematic",
    labelKey: "byTheme",
    descriptionKey: "byThemeDescription",
    // Not plain --color-teal — fails WCAG AA contrast at this text size (issue #477).
    color: "var(--color-teal-bright)",
    icon: "◈",
  },
  {
    kind: "root",
    labelKey: "byRoot",
    descriptionKey: "byRootDescription",
    color: "var(--color-gold)",
    icon: "ع",
  },
  {
    kind: "contrast",
    labelKey: "byContrast",
    descriptionKey: "byContrastDescription",
    color: "var(--color-contrast-edge)",
    icon: "↔",
  },
];

/** Opens beside the card, on the side where the new verses will appear. */
export function ExpandMenu({ verseRef, onSelect, onClose }: ExpandMenuProps) {
  const t = useTranslations("canvas");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <FocusScope asChild trapped loop>
      <div
        role="menu"
        aria-label={t("findLinkedVerses")}
        className="nodrag nowheel absolute top-0 left-full z-50 ml-3 w-64 cursor-default rounded-[14px] border border-border bg-surface-overlay p-1.5 shadow-floating"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-2.5 pt-2 pb-2.5 text-[12.5px] font-medium text-text-primary">
          {t("findLinkedVerses")}
          <span className="ml-auto rounded border border-border px-1.5 py-0.5 font-mono text-[11px] text-text-muted">
            {verseRef}
          </span>
        </div>
        {OPTIONS.map((opt) => (
          <button
            key={opt.kind}
            type="button"
            role="menuitem"
            onClick={() => {
              onSelect(opt.kind);
              onClose();
            }}
            className="grid w-full cursor-pointer grid-cols-[30px_minmax(0,1fr)] items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left transition-colors hover:bg-white/5 focus-visible:bg-white/5 focus-visible:outline-none"
          >
            <span
              className="flex h-[30px] w-[30px] items-center justify-center rounded-lg font-mono text-sm"
              style={{
                background: `color-mix(in srgb, ${opt.color} 14%, transparent)`,
                color: opt.color,
              }}
            >
              {opt.icon}
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-medium text-text-primary">
                {t(opt.labelKey)}
              </span>
              <span className="block text-xs text-text-secondary">{t(opt.descriptionKey)}</span>
            </span>
          </button>
        ))}
      </div>
    </FocusScope>
  );
}
