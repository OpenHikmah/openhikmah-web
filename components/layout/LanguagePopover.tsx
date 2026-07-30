"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as Popover from "@radix-ui/react-popover";
import { Globe } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { usePreferencesStore, type UiLocale } from "@/store/preferences";

const LOCALES: Array<{ value: UiLocale; label: string }> = [
  { value: "en", label: "English" },
  { value: "tr", label: "Türkçe" },
  { value: "ru", label: "Русский" },
  { value: "az", label: "Azərbaycan dili" },
];

/** Globe-icon quick-switcher next to the account menu — zero-navigation
 *  language switching from any page, including mid-canvas. */
export function LanguagePopover() {
  const uiLocale = usePreferencesStore((s) => s.uiLocale);
  const setUiLocale = usePreferencesStore((s) => s.setUiLocale);
  const t = useTranslations("common");
  const router = useRouter();

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          aria-label={t("changeLanguage")}
          className="grid size-9 shrink-0 place-items-center rounded-full border border-border text-text-secondary transition-colors hover:border-gold-muted/70 hover:text-text-primary"
        >
          <Globe className="size-[17px]" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="z-50 w-52 overflow-hidden rounded-2xl border border-border bg-surface-overlay p-1.5 shadow-floating"
        >
          {LOCALES.map((locale) => (
            <button
              key={locale.value}
              onClick={() => {
                setUiLocale(locale.value);
                // The cookie write above is synchronous; refresh so the
                // server-rendered layout (locale, next-intl messages) picks
                // it up without requiring a full navigation.
                router.refresh();
              }}
              className={cn(
                "flex h-9 w-full items-center rounded-lg px-3 text-[13.5px] transition-colors hover:bg-white/5",
                uiLocale === locale.value ? "font-medium text-text-primary" : "text-text-secondary"
              )}
            >
              {locale.label}
            </button>
          ))}
          <div className="my-1 h-px bg-border" />
          <Popover.Close asChild>
            <Link
              href="/settings"
              className="flex h-9 w-full items-center rounded-lg px-3 text-[13.5px] text-teal transition-colors hover:bg-white/5"
            >
              {t("allSettings")}
            </Link>
          </Popover.Close>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
