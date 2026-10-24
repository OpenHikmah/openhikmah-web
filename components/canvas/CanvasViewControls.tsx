"use client";

import * as Popover from "@radix-ui/react-popover";
import { useReactFlow } from "@xyflow/react";
import { Maximize2, Minus, Plus, RotateCcw, SlidersHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { Switch, Tooltip } from "@/components/ui";
import { useCanvasStore } from "@/store/canvas";
import { usePreferencesStore, fallbackCardHeight } from "@/store/preferences";

const BUTTON =
  "grid h-[30px] w-[30px] place-items-center rounded-[7px] text-text-secondary transition-colors hover:bg-white/5 hover:text-text-primary [&_svg]:size-3.5";

/** Bottom-right cluster: view settings for the cards, then zoom and fit. */
export function CanvasViewControls() {
  const t = useTranslations("canvas");
  const reactFlow = useReactFlow();
  const showArabic = usePreferencesStore((s) => s.canvasPrefs.showArabic);
  const setCanvasPrefs = usePreferencesStore((s) => s.setCanvasPrefs);
  const resetLayout = useCanvasStore((s) => s.resetLayout);

  return (
    <div className="flex items-center gap-0.5 rounded-[10px] border border-border bg-surface/90 p-1 backdrop-blur-sm">
      <Popover.Root>
        <Popover.Trigger asChild>
          <button
            type="button"
            className="inline-flex h-[30px] items-center gap-1.5 rounded-[7px] px-2.5 text-xs font-medium text-text-secondary transition-colors hover:bg-white/5 hover:text-text-primary data-[state=open]:bg-white/5 data-[state=open]:text-text-primary"
          >
            <SlidersHorizontal className="size-3.5" />
            {t("view")}
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            side="top"
            align="end"
            sideOffset={10}
            aria-label={t("viewSettings")}
            className="z-50 w-72 rounded-xl border border-border bg-surface-overlay p-1.5 shadow-floating"
          >
            <p className="px-2.5 pt-1.5 pb-1 font-mono text-[10.5px] tracking-[0.14em] text-text-muted uppercase">
              {t("view")}
            </p>
            <div className="flex items-center justify-between gap-3 rounded-lg px-2.5 py-2">
              <label htmlFor="canvas-view-arabic" className="text-[13px] text-text-primary">
                {t("arabicOnCards")}
                <span className="mt-0.5 block text-[11.5px] text-text-secondary">
                  {t("arabicOnCardsHint")}
                </span>
              </label>
              <Switch
                id="canvas-view-arabic"
                checked={showArabic}
                onCheckedChange={(checked) => setCanvasPrefs({ showArabic: checked })}
              />
            </div>
            <div className="my-1 h-px bg-border" />
            <Popover.Close asChild>
              <button
                type="button"
                onClick={() => resetLayout(fallbackCardHeight())}
                className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-white/5"
              >
                <RotateCcw className="mt-0.5 size-3.5 shrink-0 text-text-secondary" />
                <span className="text-[13px] text-text-primary">
                  {t("resetLayout")}
                  <span className="mt-0.5 block text-[11.5px] text-text-secondary">
                    {t("resetLayoutHint")}
                  </span>
                </span>
              </button>
            </Popover.Close>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      <span className="mx-0.5 h-[18px] w-px bg-border" />

      <Tooltip label={t("zoomOut")}>
        <button
          type="button"
          aria-label={t("zoomOut")}
          onClick={() => reactFlow.zoomOut({ duration: 200 })}
          className={BUTTON}
        >
          <Minus />
        </button>
      </Tooltip>
      <Tooltip label={t("zoomIn")}>
        <button
          type="button"
          aria-label={t("zoomIn")}
          onClick={() => reactFlow.zoomIn({ duration: 200 })}
          className={BUTTON}
        >
          <Plus />
        </button>
      </Tooltip>
      <Tooltip label={t("fitAll")}>
        <button
          type="button"
          aria-label={t("fitAll")}
          onClick={() => reactFlow.fitView({ padding: 0.35, maxZoom: 1, duration: 400 })}
          className={BUTTON}
        >
          <Maximize2 />
        </button>
      </Tooltip>
    </div>
  );
}
