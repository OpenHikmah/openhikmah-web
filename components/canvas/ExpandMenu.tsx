"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { FocusScope } from "@radix-ui/react-focus-scope";
import { useTranslations } from "next-intl";
import type { EdgeKind, VerseRef } from "@/types/quran";
import { cn } from "@/lib/utils";

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

type Box = { top: number; right: number; bottom: number; left: number };
export interface MenuPlacement {
  side: "right" | "left";
  /** Upward shift in the card's own (unzoomed) pixels, so the menu stays above the canvas's bottom edge. */
  shiftUp: number;
}

const GAP = 12;
const EDGE_MARGIN = 8;

/**
 * Where the menu fits inside the visible canvas. All boxes are screen pixels;
 * `scale` is the canvas zoom, since the menu lives inside the zoomed card.
 */
export function placeMenu(
  card: Box,
  menu: { width: number; height: number },
  bounds: Box,
  scale: number
): MenuPlacement {
  const needed = GAP * scale + menu.width + EDGE_MARGIN;
  const roomRight = bounds.right - card.right;
  const roomLeft = card.left - bounds.left;
  const side =
    roomRight >= needed || (roomLeft < needed && roomRight >= roomLeft) ? "right" : "left";
  const overflowBottom = card.top + menu.height - (bounds.bottom - EDGE_MARGIN);
  const roomAbove = Math.max(0, card.top - (bounds.top + EDGE_MARGIN));
  const shiftUp = overflowBottom > 0 ? Math.min(overflowBottom, roomAbove) / scale : 0;
  return { side, shiftUp };
}

/** Opens beside the card, on the side where the new verses will appear — unless the
 *  canvas edge is too close, then on the other side, moved up if it would run off the bottom. */
export function ExpandMenu({ verseRef, onSelect, onClose }: ExpandMenuProps) {
  const t = useTranslations("canvas");
  const menuRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<MenuPlacement>({ side: "right", shiftUp: 0 });

  useLayoutEffect(() => {
    const menu = menuRef.current;
    const card = menu?.parentElement;
    if (!menu || !card) return;
    const bounds = (
      menu.closest(".react-flow") ?? document.documentElement
    ).getBoundingClientRect();
    const rect = menu.getBoundingClientRect();
    const scale = menu.offsetWidth ? rect.width / menu.offsetWidth : 1;
    setPlacement(placeMenu(card.getBoundingClientRect(), rect, bounds, scale));
  }, []);

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
        ref={menuRef}
        role="menu"
        aria-label={t("findLinkedVerses")}
        data-side={placement.side}
        style={{ top: -placement.shiftUp }}
        className={cn(
          "nodrag nowheel absolute z-50 w-64 cursor-default rounded-[14px] border border-border bg-surface-overlay p-1.5 shadow-floating",
          placement.side === "right" ? "left-full ml-3" : "right-full mr-3"
        )}
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
